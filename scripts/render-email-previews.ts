// Renderiza os 9 templates Acrux para HTML local em /mnt/documents
// Estratégia: copia _shared para /tmp com imports patchados,
// depois usa Bun.build com loader JSX classic para gerar .mjs,
// e finalmente importa esses bundles no Node/Bun.

import * as React from "react";
import { renderAsync } from "@react-email/components";
import * as fs from "fs";
import * as path from "path";

const SRC_SHARED = path.resolve("supabase/functions/_shared");
const BUILD_DIR = "/tmp/email-preview-build";
const OUT_DIR = "/mnt/documents/email-previews";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

// 1) Copia tudo com imports patchados
async function copyTreePatched(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyTreePatched(s, d);
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      let content = fs.readFileSync(s, "utf-8")
        .replace(/npm:react@18\.3\.1/g, "react")
        .replace(/npm:@types\/react@18\.3\.1/g, "@types/react")
        .replace(/npm:@react-email\/components@0\.0\.22/g, "@react-email/components");
      fs.writeFileSync(d, content);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
await copyTreePatched(SRC_SHARED, BUILD_DIR);

// Adiciona tsconfig.json no BUILD_DIR para forçar JSX classic em todos sub-arquivos
fs.writeFileSync(
  path.join(BUILD_DIR, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      jsx: "react",
      jsxFactory: "React.createElement",
      jsxFragmentFactory: "React.Fragment",
      esModuleInterop: true,
      target: "es2020",
      module: "esnext",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
    },
  }, null, 2),
);

// 2) Lista entrypoints e bundla cada um
const entries = [
  { name: "auth-signup", file: "email-templates/signup.tsx", export: "SignupEmail", props: {
    siteName: "Acrux Contabilidade",
    siteUrl: "https://classifica.acrux-group.com.br",
    recipient: "daniel.zocarato@gmail.com",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/confirm?token=demo",
  }},
  { name: "auth-recovery", file: "email-templates/recovery.tsx", export: "RecoveryEmail", props: {
    siteName: "Acrux Contabilidade",
    confirmationUrl: "https://classifica.acrux-group.com.br/reset-password?token=demo",
  }},
  { name: "auth-magic-link", file: "email-templates/magic-link.tsx", export: "MagicLinkEmail", props: {
    siteName: "Acrux Contabilidade",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/magic?token=demo",
  }},
  { name: "auth-invite", file: "email-templates/invite.tsx", export: "InviteEmail", props: {
    siteName: "Acrux Contabilidade",
    siteUrl: "https://classifica.acrux-group.com.br",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/invite?token=demo",
  }},
  { name: "auth-email-change", file: "email-templates/email-change.tsx", export: "EmailChangeEmail", props: {
    siteName: "Acrux Contabilidade",
    oldEmail: "antigo@empresa.com.br",
    email: "antigo@empresa.com.br",
    newEmail: "novo@empresa.com.br",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/confirm-change?token=demo",
  }},
  { name: "auth-reauthentication", file: "email-templates/reauthentication.tsx", export: "ReauthenticationEmail", props: {
    token: "835291",
  }},
  { name: "transactional-competencia-pronta", file: "transactional-email-templates/competencia-pronta.tsx", export: "template" },
  { name: "transactional-competencia-concluida", file: "transactional-email-templates/competencia-concluida.tsx", export: "template" },
  { name: "transactional-competencia-reaberta", file: "transactional-email-templates/competencia-reaberta.tsx", export: "template" },
];

const BUNDLE_DIR = path.join(BUILD_DIR, "_bundles");
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

const indexEntries: Array<{ name: string; file: string; subject: string }> = [];

for (const e of entries) {
  const entry = path.join(BUILD_DIR, e.file);
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: BUNDLE_DIR,
    target: "bun",
    format: "esm",
    naming: `${e.name}.mjs`,
    // Não marcar como external — bundle tudo para evitar resolução em /tmp
  });
  if (!result.success) {
    console.error("Build failed for", e.name, result.logs);
    continue;
  }
  const bundlePath = path.join(BUNDLE_DIR, `${e.name}.mjs`);

  // Patch: garante import explícito do React (classic runtime requer)
  let bundled = fs.readFileSync(bundlePath, "utf-8");
  if (!/^import .* React .* from "react"/m.test(bundled) && !/^import \* as React from "react"/m.test(bundled)) {
    bundled = `import * as React from "react";\n` + bundled;
    fs.writeFileSync(bundlePath, bundled);
  }

  const mod = await import(bundlePath);
  let html: string;
  let subject = "";

  if (e.name.startsWith("transactional-")) {
    const tpl = mod.template;
    const props = tpl.previewData || {};
    html = await renderAsync(React.createElement(tpl.component, props));
    subject = typeof tpl.subject === "function" ? tpl.subject(props) : tpl.subject;
  } else {
    const Component = (mod as any)[e.export!] || mod.default;
    html = await renderAsync(React.createElement(Component, (e as any).props));
  }

  const out = path.join(OUT_DIR, `${e.name}.html`);
  fs.writeFileSync(out, html);
  indexEntries.push({ name: e.name, file: `${e.name}.html`, subject });
  console.log("OK", e.name, subject ? `— ${subject}` : "");
}

// Índice
const idx = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prévia emails Acrux</title>
<style>body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0f172a}
h1{font-size:20px}h2{font-size:14px;color:#475569;margin-top:32px;text-transform:uppercase;letter-spacing:.06em}
ul{list-style:none;padding:0}li{margin:8px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px}
a{color:#0a4cb0;font-weight:600;text-decoration:none}small{color:#475569;display:block;margin-top:4px}</style></head>
<body><h1>Prévia dos 9 emails Acrux</h1>
<h2>Autenticação (6)</h2><ul>
${indexEntries.filter(e => e.name.startsWith("auth-")).map(e => `<li><a href="${e.file}" target="_blank">${e.name}</a></li>`).join("\n")}
</ul>
<h2>Transacionais (3)</h2><ul>
${indexEntries.filter(e => e.name.startsWith("transactional-")).map(e => `<li><a href="${e.file}" target="_blank">${e.name}</a><small>Assunto: ${e.subject}</small></li>`).join("\n")}
</ul></body></html>`;
fs.writeFileSync(path.join(OUT_DIR, "index.html"), idx);
console.log("\nÍndice:", path.join(OUT_DIR, "index.html"));
