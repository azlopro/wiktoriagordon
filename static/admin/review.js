'use strict';

(function () {
  const REPO = 'wiktoriagordon/w-website';
  const BRANCH = 'master';
  const API = `https://api.github.com/repos/${REPO}`;
  const inputs = Array.from(document.querySelectorAll('.copy-input'));
  const files = [...new Set(inputs.map((input) => input.dataset.file))];
  const signInButton = document.querySelector('#sign-in');
  const saveButton = document.querySelector('#save-changes');
  const status = document.querySelector('#editor-status');

  let token = '';
  let headSha = '';
  let baseTreeSha = '';
  let documents = new Map();
  let authPopup = null;
  let busy = false;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function resize(input) {
    input.style.height = 'auto';
    input.style.height = `${Math.max(input.scrollHeight, 42)}px`;
  }

  function pathParts(path) {
    return path.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part);
  }

  function valueAt(root, path) {
    return pathParts(path).reduce((value, part) => value == null ? value : value[part], root);
  }

  function setValueAt(root, path, value) {
    const parts = pathParts(path);
    const last = parts.pop();
    const parent = parts.reduce((item, part) => item[part], root);
    parent[last] = value;
  }

  function decodeBase64(value) {
    const binary = atob(value.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  async function github(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = new Error(`GitHub request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    return response.status === 204 ? null : response.json();
  }

  function updateDirtyState(input) {
    const dirty = input.value !== input.dataset.originalValue;
    input.classList.toggle('is-dirty', dirty);
    input.closest('.copy-row').classList.toggle(
      'has-dirty',
      Array.from(input.closest('.copy-row').querySelectorAll('.copy-input')).some((field) => field.classList.contains('is-dirty')),
    );
    saveButton.disabled = busy || !inputs.some((field) => field.classList.contains('is-dirty'));
    if (!busy) {
      setStatus(saveButton.disabled ? 'All changes are saved.' : 'You have unsaved changes.', saveButton.disabled ? 'saved' : 'dirty');
    }
  }

  function populateInputs() {
    for (const input of inputs) {
      const document = documents.get(input.dataset.file);
      const locale = input.dataset.shared ? 'da' : input.dataset.locale;
      const value = valueAt(document[locale], input.dataset.path);
      input.value = value == null ? '' : String(value);
      input.dataset.originalValue = input.value;
      input.readOnly = false;
      input.classList.remove('is-dirty');
      input.closest('.copy-row').classList.remove('has-dirty');
      resize(input);
    }
  }

  async function loadEditor() {
    busy = true;
    signInButton.disabled = true;
    setStatus('Loading the latest text…');

    try {
      const reference = await github(`/git/ref/heads/${BRANCH}`);
      headSha = reference.object.sha;
      const commit = await github(`/git/commits/${headSha}`);
      baseTreeSha = commit.tree.sha;

      const entries = await Promise.all(files.map(async (file) => {
        const source = await github(`/contents/data/${file}.yaml?ref=${encodeURIComponent(BRANCH)}`);
        return [file, window.jsyaml.load(decodeBase64(source.content))];
      }));

      documents = new Map(entries);
      populateInputs();
      signInButton.hidden = true;
      saveButton.hidden = false;
      saveButton.disabled = true;
      setStatus('All changes are saved.', 'saved');
    } catch (error) {
      token = '';
      signInButton.disabled = false;
      setStatus(error.status === 401 ? 'The login expired. Please sign in again.' : 'The text could not be loaded. Please try again.', 'error');
    } finally {
      busy = false;
    }
  }

  function beginLogin() {
    if (busy) return;
    authPopup = window.open('/auth?provider=github&scope=repo,user', 'review-text-login', 'width=640,height=720');
    if (!authPopup) {
      setStatus('Allow the login pop-up, then try again.', 'error');
      return;
    }
    setStatus('Waiting for GitHub login…');
  }

  async function saveChanges() {
    const dirtyInputs = inputs.filter((input) => input.classList.contains('is-dirty'));
    if (busy || dirtyInputs.length === 0) return;

    busy = true;
    saveButton.disabled = true;
    setStatus('Saving changes…');

    try {
      const latestReference = await github(`/git/ref/heads/${BRANCH}`);
      if (latestReference.object.sha !== headSha) {
        throw Object.assign(new Error('branch_changed'), { code: 'branch_changed' });
      }

      const changedFiles = new Set();
      for (const input of dirtyInputs) {
        const document = documents.get(input.dataset.file);
        if (input.dataset.shared) {
          setValueAt(document.da, input.dataset.path, input.value);
          setValueAt(document.en, input.dataset.path, input.value);
        } else {
          setValueAt(document[input.dataset.locale], input.dataset.path, input.value);
        }
        changedFiles.add(input.dataset.file);
      }

      const blobs = await Promise.all([...changedFiles].map(async (file) => {
        const yaml = window.jsyaml.dump(documents.get(file), {
          lineWidth: 100,
          noRefs: false,
          quotingType: '"',
          forceQuotes: true,
        });
        const blob = await github('/git/blobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: encodeBase64(yaml), encoding: 'base64' }),
        });
        return { path: `data/${file}.yaml`, mode: '100644', type: 'blob', sha: blob.sha };
      }));

      const tree = await github('/git/trees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
      });
      const commit = await github('/git/commits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Website editor: review all text',
          tree: tree.sha,
          parents: [headSha],
        }),
      });
      await github(`/git/refs/heads/${BRANCH}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });

      headSha = commit.sha;
      baseTreeSha = tree.sha;
      for (const input of dirtyInputs) {
        input.dataset.originalValue = input.value;
        input.classList.remove('is-dirty');
        input.closest('.copy-row').classList.remove('has-dirty');
      }
      setStatus('Saved. The website will update in a minute or two.', 'saved');
    } catch (error) {
      if (error.code === 'branch_changed' || error.status === 422) {
        setStatus('Someone else saved changes first. Reload this page before editing again.', 'error');
      } else if (error.status === 401) {
        token = '';
        signInButton.hidden = false;
        signInButton.disabled = false;
        setStatus('The login expired. Sign in again; your text is still here.', 'error');
      } else {
        setStatus('The changes could not be saved. They are still here, so please try again.', 'error');
      }
    } finally {
      busy = false;
      saveButton.disabled = !inputs.some((input) => input.classList.contains('is-dirty'));
    }
  }

  window.addEventListener('message', (event) => {
    if (!authPopup || event.source !== authPopup || event.origin !== window.location.origin || typeof event.data !== 'string') return;

    if (event.data === 'authorizing:github') {
      authPopup.postMessage('authorizing:github', window.location.origin);
      return;
    }

    const prefix = 'authorization:github:success:';
    if (!event.data.startsWith(prefix)) {
      if (event.data.startsWith('authorization:github:error:')) setStatus('GitHub login failed. Please try again.', 'error');
      return;
    }

    try {
      const result = JSON.parse(event.data.slice(prefix.length));
      token = result.token;
      authPopup.close();
      loadEditor();
    } catch (_) {
      setStatus('GitHub login failed. Please try again.', 'error');
    }
  });

  for (const input of inputs) {
    resize(input);
    input.addEventListener('input', () => {
      resize(input);
      updateDirtyState(input);
    });
  }

  signInButton.addEventListener('click', beginLogin);
  saveButton.addEventListener('click', saveChanges);
  window.addEventListener('beforeunload', (event) => {
    if (!inputs.some((input) => input.classList.contains('is-dirty'))) return;
    event.preventDefault();
    event.returnValue = '';
  });
}());
