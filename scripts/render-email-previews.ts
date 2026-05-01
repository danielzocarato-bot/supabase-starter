// Renderiza os 9 templates Acrux para HTML local em /mnt/documents
// Usado apenas para QA visual antes do disparo real.

import * as React from "react";
import { renderAsync } from "@react-email/components";
import * as fs from "fs";
import * as path from "path";

// Map TSX→TSX local. Como os shells usam `npm:` specifiers (Deno),
// substituímos imports antes de carregar via Bun.
const TEMPLATES_DIR = path.resolve("supabase/functions/_shared");
const OUT_DIR = "/mnt/documents/email-previews";

fs.mkdirSync(OUT_DIR, { recursive: true });

// Carrega via dynamic import com transform manual: lemos o arquivo e
// trocamos `npm:react@18.3.1` etc. por specifiers Node ANTES de eval.
async function loadModule(filePath: string): Promise<any> {
  const original = fs.readFileSync(filePath, "utf-8");
  const patched = original
    .replace(/npm:react@18\.3\.1/g, "react")
    .replace(/npm:@types\/react@18\.3\.1/g, "@types/react")
    .replace(/npm:@react-email\/components@0\.0\.22/g, "@react-email/components");
  const tmpDir = "/tmp/email-preview-build";
  fs.mkdirSync(tmpDir, { recursive: true });
  const rel = path.relative(TEMPLATES_DIR, filePath);
  const outPath = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, patched);
  return outPath;
}

// Recursivo: copia _shared inteiro com patch
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
      // Garante import explícito do React em arquivos TSX (classic JSX)
      if (entry.name.endsWith(".tsx") && !/^import \* as React/m.test(content)) {
        content = `import * as React from "react";\n` + content;
      }
      fs.writeFileSync(d, content);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

const tmpRoot = "/tmp/email-preview-build/_shared";
fs.rmSync(tmpRoot, { recursive: true, force: true });
await copyTreePatched(TEMPLATES_DIR, tmpRoot);

// AUTH templates
const auth = [
  { file: "email-templates/signup.tsx", export: "SignupEmail", props: {
    siteName: "Acrux Contabilidade",
    siteUrl: "https://classifica.acrux-group.com.br",
    recipient: "daniel.zocarato@gmail.com",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/confirm?token=demo",
  }},
  { file: "email-templates/recovery.tsx", export: "RecoveryEmail", props: {
    siteName: "Acrux Contabilidade",
    confirmationUrl: "https://classifica.acrux-group.com.br/reset-password?token=demo",
  }},
  { file: "email-templates/magic-link.tsx", export: "MagicLinkEmail", props: {
    siteName: "Acrux Contabilidade",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/magic?token=demo",
  }},
  { file: "email-templates/invite.tsx", export: "InviteEmail", props: {
    siteName: "Acrux Contabilidade",
    siteUrl: "https://classifica.acrux-group.com.br",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/invite?token=demo",
  }},
  { file: "email-templates/email-change.tsx", export: "EmailChangeEmail", props: {
    siteName: "Acrux Contabilidade",
    oldEmail: "antigo@empresa.com.br",
    email: "antigo@empresa.com.br",
    newEmail: "novo@empresa.com.br",
    confirmationUrl: "https://classifica.acrux-group.com.br/auth/confirm-change?token=demo",
  }},
  { file: "email-templates/reauthentication.tsx", export: "ReauthenticationEmail", props: {
    token: "835291",
  }},
];

// TRANSACTIONAL templates (usam previewData do registry)
const trans = [
  { file: "transactional-email-templates/competencia-pronta.tsx" },
  { file: "transactional-email-templates/competencia-concluida.tsx" },
  { file: "transactional-email-templates/competencia-reaberta.tsx" },
];

const indexEntries: Array<{ name: string; file: string; subject: string }> = [];

for (const t of auth) {
  const mod = await import(path.join(tmpRoot, t.file));
  const Component = mod[t.export] || mod.default;
  const html = await renderAsync(React.createElement(Component, t.props));
  const name = path.basename(t.file, ".tsx");
  const out = path.join(OUT_DIR, `auth-${name}.html`);
  fs.writeFileSync(out, html);
  indexEntries.push({ name: `auth · ${name}`, file: `auth-${name}.html`, subject: "" });
  console.log("OK", out);
}

for (const t of trans) {
  const mod = await import(path.join(tmpRoot, t.file));
  const entry = mod.template;
  const props = entry.previewData || {};
  const html = await renderAsync(React.createElement(entry.component, props));
  const subj = typeof entry.subject === "function" ? entry.subject(props) : entry.subject;
  const name = path.basename(t.file, ".tsx");
  const out = path.join(OUT_DIR, `transactional-${name}.html`);
  fs.writeFileSync(out, html);
  indexEntries.push({ name: `transacional · ${name}`, file: `transactional-${name}.html`, subject: subj });
  console.log("OK", out, "—", subj);
}

// index.html para fácil navegação
const idx = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prévia emails Acrux</title>
<style>body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0f172a}
h1{font-size:20px}ul{list-style:none;padding:0}li{margin:8px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px}
a{color:#0a4cb0;font-weight:600;text-decoration:none}small{color:#475569;display:block;margin-top:4px}</style></head>
<body><h1>Prévia dos 9 emails Acrux</h1><ul>
${indexEntries.map(e => `<li><a href="${e.file}" target="_blank">${e.name}</a>${e.subject ? `<small>Assunto: ${e.subject}</small>` : ""}</li>`).join("\n")}
</ul></body></html>`;
fs.writeFileSync(path.join(OUT_DIR, "index.html"), idx);
console.log("\nÍndice:", path.join(OUT_DIR, "index.html"));
