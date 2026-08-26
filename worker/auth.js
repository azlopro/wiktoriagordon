/* Login til /admin/.
 *
 * Sveltia CMS åbner et pop op-vindue mod /auth, som sender brugeren til
 * GitHub. GitHub sender hende tilbage til /callback med en kode, som byttes
 * til et token her på serveren. Tokenet gives videre til CMS-vinduet med
 * postMessage.
 *
 * Der findes en færdig worker til det (sveltia-cms-auth), men den er bygget
 * til at betjene vilkårlige domæner og skal derfor deployes for sig med sin
 * egen adresse. Her betjener vi kun ét domæne, hendes eget, så tjekket er
 * trivielt, og det bliver én ting mindre at vedligeholde ved overdragelsen.
 *
 * Klienthemmeligheden ligger som Worker-secret og forlader aldrig serveren.
 */

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const PROVIDER = 'github';

/* Hvem må få et token. Uden den her kunne et hvilket som helst site åbne
   vores /auth og få adgang til hendes repo. */
const ALLOWED_ORIGINS = [
  'https://www.wiktoriagordon.dk',
  'https://wiktoriagordon.dk',
  'http://127.0.0.1:8788',
  'http://localhost:8788',
];

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      /* Siden kører ét lille script og henter intet udefra. */
      'content-security-policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
    },
  });

function page(title, message) {
  return html(
    `<!doctype html><html lang="da"><meta charset="utf-8">` +
      `<title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;margin:0;display:grid;` +
      `place-items:center;min-height:100vh;background:#F4F2F2;color:#171315}` +
      `div{max-width:28rem;padding:2rem;text-align:center;line-height:1.6}</style>` +
      `<div><h1 style="font-weight:500;font-size:1.2rem">${title}</h1><p>${message}</p></div>`,
    400,
  );
}

/** Trin 1: send brugeren videre til GitHub. */
export function handleAuth(url, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return page('Login er ikke sat op endnu', 'GitHub-nøglerne mangler på serveren.');
  }

  /* CSRF: en tilfældig værdi gemmes i en cookie og sendes med til GitHub.
     Kommer de to ikke tilbage sammen, er kaldet ikke startet her. */
  const csrf = crypto.randomUUID().replaceAll('-', '');

  const to = new URL(GITHUB_AUTHORIZE);
  to.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  to.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
  to.searchParams.set('state', csrf);

  return new Response(null, {
    status: 302,
    headers: {
      location: to.href,
      'set-cookie':
        `csrf-token=${PROVIDER}_${csrf}; HttpOnly; Path=/; Max-Age=600; ` +
        'SameSite=Lax; Secure',
      'cache-control': 'no-store',
    },
  });
}

/** Trin 2: byt koden til et token og giv det videre til CMS-vinduet. */
export async function handleCallback(request, url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/\bcsrf-token=([a-z]+?)_([0-9a-f]{32})\b/);

  if (!code || !state || !match || match[1] !== PROVIDER || match[2] !== state) {
    return page('Login kunne ikke gennemføres', 'Prøv igen fra /admin/.');
  }

  let payload;
  try {
    const res = await fetch(GITHUB_TOKEN, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    payload = await res.json();
  } catch (err) {
    console.error('token exchange', err);
    payload = { error: 'exchange_failed' };
  }

  const ok = Boolean(payload && payload.access_token);
  const content = ok
    ? { token: payload.access_token, provider: PROVIDER }
    : { error: (payload && payload.error) || 'unknown', errorCode: 'auth_failed' };

  /* JSON lægges ind i siden som data, ikke som kode: uden det kunne en værdi
     fra GitHub bryde ud af strengen og køre i browseren. */
  const data = JSON.stringify(JSON.stringify(content));
  const allowed = JSON.stringify(ALLOWED_ORIGINS);

  return html(
    `<!doctype html><html lang="da"><meta charset="utf-8"><title>Logger ind…</title>` +
      `<body><script>(function(){` +
      `var content=${data},allowed=${allowed},state=${ok ? '"success"' : '"error"'};` +
      /* CMS-vinduet melder sig først. event.origin kan ikke forfalskes af
         afsenderen, så den afgør hvem svaret sendes til. */
      `window.addEventListener("message",function(e){` +
      `if(e.data!=="authorizing:${PROVIDER}")return;` +
      `if(allowed.indexOf(e.origin)===-1)return;` +
      `e.source.postMessage("authorization:${PROVIDER}:"+state+":"+content,e.origin);` +
      `},false);` +
      `window.opener&&window.opener.postMessage("authorizing:${PROVIDER}","*");` +
      `})();</script>` +
      `<p style="font-family:system-ui,sans-serif;text-align:center;margin-top:3rem">Logger ind…</p>`,
  );
}
