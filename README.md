# CestaON — "No CestaON, o preço é bom." 🛒✨

> **O Assistente Inteligente de Feiras e Supermercados**  
> Aplicação web progressiva (PWA), colaborativa em tempo real e 100% resiliente a ambientes offline (*Modo Subsolo*), desenvolvida sob o mandato estrito de **100% Custo Zero Perpétuo ($0)** e máxima performance de engenharia.

[![Demo Online](https://img.shields.io/badge/Demo%20Online-cestaon.onrender.com-10B981?style=for-the-badge&logo=render&logoColor=white)](https://cestaon.onrender.com/)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Testes Automatizados](https://img.shields.io/badge/Testes-229%20Passando%20(41%20suites)-success?style=for-the-badge)](./tests)
[![Banco em Nuvem](https://img.shields.io/badge/Turso-LibSQL%20Cloud-00E599?style=for-the-badge&logo=sqlite&logoColor=black)](https://turso.tech/)

---

## 🌟 Principais Recursos

- 📱 **PWA Offline-First ("Modo Subsolo"):** Funciona perfeitamente mesmo sem conexão 3G/4G no subsolo de supermercados. Possui motor de Cache Preditivo, Service Worker v11 (`cestaon-pwa-v11-prod`), fila de mutações no IndexedDB com Background Sync nativo e drenagem automática pós-reconexão.
- ⚡ **Colaboração Familiar em Tempo Real:** Sincronização instantânea de itens via WebSockets nativos (`ws`) blindados contra CSWSH, com controle granular de participantes e Fila Atômica com Merging Concorrente por Item (`ItemMutationQueue` — Lost Update Prevention).
- ⚖️ **Calculadora de Embalagens Inteligente:** Normalização matemática automática de grandezas (g, kg, ml, L, un, dz) com cálculo do produto mais vantajoso em tempo real, 100% offline e com paridade estrita backend/frontend.
- 📊 **Inteligência de Preços & "Onde Comprar":** Comparativo delta entre feiras passadas e simulação instantânea do custo da cesta em estabelecimentos concorrentes sem queries N+1.
- 🔒 **Segurança Criptográfica & Anti-Takeover:**
  - Autenticação exclusiva por e-mail e senha com derivação de chave PBKDF2 assíncrona não bloqueante.
  - Códigos de verificação transacionais de 6 dígitos gerados via CSPRNG e armazenados com hash seguro HMAC-SHA256 no banco (protegido contra vazamentos).
  - Recuperação de acesso com Chave Secreta de Emergência e Pergunta Secreta.
- ⚖️ **Conformidade Legal Rigorosa (LGPD & Marco Civil da Internet):**
  - **Direito à Portabilidade (Art. 18, V):** Exportação completa de todos os dados do usuário e feiras em arquivo JSON estruturado.
  - **Direito à Eliminação Definitiva (Art. 18, VI):** Exclusão permanente em cascata atômica de usuário, histórico e listas direto no perfil com confirmação de senha.
  - **Marco Civil da Internet (Art. 15):** Middleware estruturado de auditoria e registro de acessos (`[AUDIT-LOG]`) sem expor dados sensíveis.
  - **Minimização e Consentimento (Art. 6º, III e Art. 9º):** Termos de Uso e Política de Privacidade integrados no cadastro, informando sobre a não comercialização dos dados.

---

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, Service Worker v11 com PWA Manifest W3C e IndexedDB v2.
- **Backend:** Node.js 22 LTS (ES Modules), Express blindado com headers OWASP (CSP, HSTS, X-Content-Type-Options, X-Frame-Options), WebSockets nativos (`ws`).
- **Persistência Híbrida Atômica:** 
  - SQLite local nativo (`node:sqlite`) com WAL mode, autocheckpoint e busy_timeout (5000ms).
  - Banco em nuvem perpétuo 100% gratuito **Turso LibSQL Cloud** (`@libsql/client`) com replicação write-through atômica fail-closed, savepoints transacionais e restauração pré-boot.
- **E-mails Transacionais:** Suporte a **Google Apps Script Webhook** e **Brevo REST API** via HTTPS (porta 443 — imune a bloqueios SMTP de nuvem gratuita) e fallback para Gmail SMTP.

---

## 🌐 Acesso à Aplicação

A aplicação está disponível e operacional diretamente pela web:

👉 **[https://cestaon.onrender.com/](https://cestaon.onrender.com/)**

Para instalar como aplicativo móvel (PWA), basta acessar o link pelo celular (Chrome ou Safari) e selecionar **"Adicionar à Tela Inicial"**.

---

## 🔒 Propriedade Intelectual e Uso

Este repositório é de uso estritamente privado e demonstrativo para fins de portfólio profissional e avaliação técnica:
- **Todos os Direitos Reservados**: É terminantemente proibida a cópia, clonagem, redistribuição, engenharia reversa ou exploração comercial deste código-fonte sem autorização prévia por escrito do autor.
- A aplicação foi arquitetada para operar de forma integrada à infraestrutura de produção em nuvem.

---

## ☁️ Deploy em Produção (100% Gratuito Para Sempre)

Aplicação online disponível em: **[https://cestaon.onrender.com/](https://cestaon.onrender.com/)**

Consulte o guia detalhado de arquitetura e infraestrutura:
- [HOSPEDAGEM_E_BANCO.md](./HOSPEDAGEM_E_BANCO.md): Especificação completa de todas as conexões, portas e cotas gratuitas perpétuas ($0/mês).

---

## 🧪 Qualidade de Código e Testes Automatizados

O projeto conta com **229 testes automatizados** distribuídos em **41 suítes**, cobrindo:
- Testes ponta a ponta da API REST e WebSockets.
- Paridade matemática dos motores de cálculo offline e online.
- Testes de concorrência com fusão atômica de mutações (`ItemMutationQueue`).
- Testes defensivos de segurança (Ciclos 1 a 8 e Auditoria White-Box SEC-01 a SEC-05).
- Testes de conformidade com LGPD e Marco Civil da Internet.

Para rodar todos os testes:
```bash
npm test
```

---

## 📄 Governança e Rastreabilidade

- Consulte o [MAPA_DO_PROJETO.md](./MAPA_DO_PROJETO.md) para a rastreabilidade contínua de todos os arquivos do repositório.
