const profileName = document.querySelector('[data-profile-name]');
const profileBio = document.querySelector('[data-profile-bio]');
const profileHandle = document.querySelector('[data-profile-handle]');
const profileAvatar = document.querySelector('[data-profile-avatar]');
const profileWebsite = document.querySelector('[data-profile-website]');
const postsRoot = document.querySelector('[data-posts]');
const verificationStatus = document.querySelector('[data-verification-status]');

await boot();

async function boot() {
  try {
    const profile = await fetchJson('./profile.json');
    const feed = await fetchJson('./feed.json');
    const verifiedPosts = [];

    profileName.textContent = profile.name;
    profileHandle.textContent = profile.handle;
    profileBio.textContent = profile.bio || profile.handle;
    setProfileAvatar(profile);
    setProfileWebsite(profile);

    for (const post of feed.posts) {
      if (await verifyPost(post, profile)) {
        verifiedPosts.push(post);
      }
    }

    verifiedPosts.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    verificationStatus.textContent =
      verifiedPosts.length === 1 ? '1 verified post' : `${verifiedPosts.length} verified posts`;
    postsRoot.innerHTML = renderPosts(verifiedPosts);
  } catch (error) {
    verificationStatus.textContent = 'Unavailable';
    postsRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message || 'Could not load feed')}</p>`;
  }
}

function setProfileAvatar(profile) {
  const avatar = profile.avatar || profile.endpoints?.avatar;

  if (!avatar || !profileAvatar) {
    return;
  }

  profileAvatar.src = avatar;
}

function setProfileWebsite(profile) {
  if (!profile.website || !profileWebsite) {
    return;
  }

  profileWebsite.href = profile.website;
  profileWebsite.textContent = new URL(profile.website).host;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function verifyPost(post, profile) {
  if (post.author !== profile.handle || post.signature?.alg !== 'ES256') {
    return false;
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      profile.publicKey.jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const payload = new TextEncoder().encode(canonicalStringify(postSigningPayload(post)));

    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(post.signature.value),
      payload,
    );
  } catch {
    return false;
  }
}

function postSigningPayload(post) {
  const { signature, ...payload } = post;

  return payload;
}

function canonicalStringify(value) {
  return JSON.stringify(toCanonicalValue(value));
}

function toCanonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not support non-finite numbers.');
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : toCanonicalValue(item)));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, toCanonicalValue(value[key])]),
    );
  }

  throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function renderPosts(posts) {
  if (posts.length === 0) {
    return '<p class="empty-state">No verified posts yet.</p>';
  }

  return posts
    .map(
      (post) => `
        <article class="post-card">
          <h3>${escapeHtml(formatDate(post.createdAt))}</h3>
          <p>${escapeHtml(post.content)}</p>
          <details class="technical-details post-details">
            <summary>Signature</summary>
            <code>${escapeHtml(post.signature.value)}</code>
          </details>
        </article>
      `,
    )
    .join('');
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
