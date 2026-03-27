# Design Map

> Atualizado em: 2026-03-27
> Escopo: `desktop/renderer/src/ui`
> Foco: estrutura visual, tokens, cores, tipografia, superfícies e pontos de acoplamento para redesign

## 1. Leitura Rápida

O app hoje tem uma identidade visual relativamente clara, mas pouco centralizada:

- Base visual: dark UI com superfícies preto/cinza, texto claro, CTA neon-lime e acento laranja.
- Estilo dominante: vidro fosco leve, bordas em gradiente translúcido, pills arredondadas e overlays claros.
- Design system real: mora em [`desktop/renderer/src/ui/styles/base.css`](../renderer/src/ui/styles/base.css), não em [`desktop/renderer/src/ui/styles/variables.css`](../renderer/src/ui/styles/variables.css).
- Problema estrutural: os tokens globais cobrem a base, mas boa parte da identidade está espalhada em `*.module.css` com cores hardcoded.
- Consequência: trocar a identidade vai exigir mexer em tokens + hotspots locais, não só em um arquivo central.

## 2. Arquitetura Atual Do Design

### 2.1 Arquivos-base

- Entrada global: [`desktop/renderer/src/ui/styles/index.css`](../renderer/src/ui/styles/index.css)
- Tokens e resets: [`desktop/renderer/src/ui/styles/base.css`](../renderer/src/ui/styles/base.css)
- Variáveis auxiliares quase vazias: [`desktop/renderer/src/ui/styles/variables.css`](../renderer/src/ui/styles/variables.css)
- UI kit fragmentado:
  - [`desktop/renderer/src/ui/styles/kit/layout.css`](../renderer/src/ui/styles/kit/layout.css)
  - [`desktop/renderer/src/ui/styles/kit/buttons.css`](../renderer/src/ui/styles/kit/buttons.css)
  - [`desktop/renderer/src/ui/styles/kit/forms.css`](../renderer/src/ui/styles/kit/forms.css)
  - [`desktop/renderer/src/ui/styles/kit/typography.css`](../renderer/src/ui/styles/kit/typography.css)
  - [`desktop/renderer/src/ui/styles/kit/modals.css`](../renderer/src/ui/styles/kit/modals.css)

### 2.2 Onde a identidade está de fato

- Base escura e tokens: [`desktop/renderer/src/ui/styles/base.css`](../renderer/src/ui/styles/base.css)
- Shell, hero, glass cards: [`desktop/renderer/src/ui/styles/kit/layout.css`](../renderer/src/ui/styles/kit/layout.css)
- Providers/modelos: [`desktop/renderer/src/ui/styles/providers-shared.css`](../renderer/src/ui/styles/providers-shared.css)
- Skills/integrations: [`desktop/renderer/src/ui/styles/skill-cards.css`](../renderer/src/ui/styles/skill-cards.css)
- Banners/update states: [`desktop/renderer/src/ui/styles/update-banner.css`](../renderer/src/ui/styles/update-banner.css), [`desktop/renderer/src/ui/updates/DefenderBanner.module.css`](../renderer/src/ui/updates/DefenderBanner.module.css), [`desktop/renderer/src/ui/shared/banners/BannerCarousel.module.css`](../renderer/src/ui/shared/banners/BannerCarousel.module.css)
- Chat e settings têm vários estilos próprios fora do kit.

## 3. Tokens Globais

Fonte principal: [`desktop/renderer/src/ui/styles/base.css#L1`](../renderer/src/ui/styles/base.css#L1)

### 3.1 Paleta-base

- `--bg`: `#171717`
- `--surface-primary`: `#121212`
- `--surface-secondary`: `#292929`
- `--surface-tertiary`: `#343434`
- `--bg-base`: `#1e1e1e`
- `--bg-card`: `#1d1d1d`
- `--bg-elevated`: `#2c2c2c`
- `--text`: `#e6edf3`
- `--muted`: `rgba(230, 237, 243, 0.82)`
- `--muted2`: `rgba(230, 237, 243, 0.65)`
- `--muted3`: `rgba(230, 237, 243, 0.45)`
- `--accent`: `#ff7a00`
- `--lime`: `#aeff00`
- `--lime-soft`: `#c4ff47`

### 3.2 Cores semânticas

- `--success`: `#38bb58`
- `--error`: `#ef4444`
- `--warning`: `#ff7a00`
- `--info`: `#0d6fff`

### 3.3 Bordas, overlays e estados

- `--panel`: `rgba(255, 255, 255, 0.03)`
- `--surface-overlay-subtle`: `rgba(255, 255, 255, 0.06)`
- `--surface-overlay`: `rgba(255, 255, 255, 0.08)`
- `--surface-overlay-strong`: `rgba(255, 255, 255, 0.12)`
- `--border`: `rgba(230, 237, 243, 0.12)`
- `--border-light`: `rgba(230, 237, 243, 0.1)`
- `--border-subtle`: `rgba(230, 237, 243, 0.06)`
- `--focus-ring`: `rgba(13, 111, 255, 0.5)`

### 3.4 Escala

- Spacing: `4, 8, 12, 16, 24, 32`
- Typography tokens: `12, 13, 14, 16, 18`
- Radius: `4, 6, 8, 10, 12, 14, 16, 18, full`
- Motion: `120ms`, `200ms`, `300ms`

## 4. Tipografia

### 4.1 Fonte

- Fonte base do app: system stack em [`desktop/renderer/src/ui/styles/base.css#L86`](../renderer/src/ui/styles/base.css#L86)
- Sem fonte de marca própria.
- Monoespaçada usada em `pre`, markdown e terminal.

### 4.2 Situação real

- Existem tokens de tamanho, mas o projeto usa muitos `font-size` hardcoded em `13px`, `14px`, `15px`, `26px`.
- A escala tipográfica está só parcialmente tokenizada.
- O chat usa `font-family: var(--font-body)` em [`desktop/renderer/src/ui/chat/components/ChatComposer.module.css#L240`](../renderer/src/ui/chat/components/ChatComposer.module.css#L240), mas `--font-body` nao existe em nenhum token global.

## 5. Linguagem Visual

### 5.1 Padrões dominantes

- Tema exclusivamente escuro.
- CTA principal quase sempre em lime.
- Secundárias em branco/cinza translúcido.
- Cards com uma destas abordagens:
  - fundo sólido escuro
  - fundo escuro com borda translúcida
  - glass card com gradiente de borda
- Blur/backdrop em topbar, modais e banners.
- Quase tudo usa radius médio/alto; pouco elemento quadrado.

### 5.2 Padrões reutilizados

- `--radius-full`, `--lime` e `--surface-overlay` são os tokens mais recorrentes.
- Hardcodes mais repetidos no CSS:
  - `white`
  - `#fff`
  - `#ffffff`
  - opacidades brancas como `rgba(255, 255, 255, 0.5)`, `0.4`, `0.1`, `0.45`
- Isso mostra que a interface depende fortemente de branco translúcido sobre fundo escuro.

## 6. Mapa De Cores Por Área

### 6.1 Shell, app e sidebar

Arquivos:

- [`desktop/renderer/src/ui/app/App.module.css`](../renderer/src/ui/app/App.module.css)
- [`desktop/renderer/src/ui/sidebar/Sidebar.module.css`](../renderer/src/ui/sidebar/Sidebar.module.css)

Características:

- Fundo de estrutura em `surface-primary`.
- Sidebar minimalista, com hover/active usando `border-subtle`.
- Topbar com fundo escuro translúcido e CTA lime.

### 6.2 Chat

Arquivos principais:

- [`desktop/renderer/src/ui/chat/components/ChatComposer.module.css`](../renderer/src/ui/chat/components/ChatComposer.module.css)
- [`desktop/renderer/src/ui/chat/components/ToolCallCard.module.css`](../renderer/src/ui/chat/components/ToolCallCard.module.css)
- [`desktop/renderer/src/ui/chat/components/MessageMeta.module.css`](../renderer/src/ui/chat/components/MessageMeta.module.css)

Características:

- Composer usa caixa escura própria `#272727`, fora dos tokens globais.
- Botão de envio lime.
- Stop button branco puro com centro quase preto.
- Tool cards e metadados usam vários hardcodes locais para status.

### 6.3 Onboarding e bootstrap

Arquivos:

- [`desktop/renderer/src/ui/styles/onboarding-styles.css`](../renderer/src/ui/styles/onboarding-styles.css)
- [`desktop/renderer/src/ui/styles/gateway-splash.css`](../renderer/src/ui/styles/gateway-splash.css)
- [`desktop/renderer/src/ui/onboarding/*.module.css`](../renderer/src/ui/onboarding)

Características:

- Hero forte, uppercase em alguns contextos, glow suave, splash com gradientes radiais.
- Uso consistente do dark + white + lime, mas com várias telas específicas usando hardcodes de azul, laranja e vermelho.

### 6.4 Providers e modelos

Arquivo-base:

- [`desktop/renderer/src/ui/styles/providers-shared.css`](../renderer/src/ui/styles/providers-shared.css)

Características:

- Visual de lista/cards alinhado com o tema base.
- Mas badges de categoria usam cores próprias:
  - azul `#4e95ff`
  - magenta `#f34eff`
  - amarelo `#ffb300`
  - teal `#14b8a6`
- Radio selecionado também usa azul hardcoded `#1c8af5`.
- Tier badges de modelos usam amarelo, cyan e magenta hardcoded.

### 6.5 Skills e integrações

Arquivo-base:

- [`desktop/renderer/src/ui/styles/skill-cards.css`](../renderer/src/ui/styles/skill-cards.css)

Características:

- É uma das áreas mais coloridas do app.
- Cada provider/skill tem background próprio com gradiente específico.
- Connected state usa verde próprio fora da abstração semântica completa.
- Botão principal desses cards usa branco puro, não lime.

### 6.6 Settings

Arquivos:

- [`desktop/renderer/src/ui/settings/SettingsPage.module.css`](../renderer/src/ui/settings/SettingsPage.module.css)
- [`desktop/renderer/src/ui/settings/account/AccountTab.module.css`](../renderer/src/ui/settings/account/AccountTab.module.css)
- [`desktop/renderer/src/ui/settings/OtherTab.module.css`](../renderer/src/ui/settings/OtherTab.module.css)

Características:

- `SettingsPage` segue o dark principal, com detalhe azul na tab ativa.
- `AccountTab` é o hotspot com maior volume de estilos próprios e estados financeiros.
- `OtherTab` quebra a linguagem dominante e puxa visual iOS:
  - `#f2f2f7`
  - `#2c2c2e`
  - `#3a3a3c`
  - `#0a84ff`
  - `#ff453a`

### 6.7 Updates, banners e feedback

Arquivos:

- [`desktop/renderer/src/ui/styles/update-banner.css`](../renderer/src/ui/styles/update-banner.css)
- [`desktop/renderer/src/ui/updates/DefenderBanner.module.css`](../renderer/src/ui/updates/DefenderBanner.module.css)
- [`desktop/renderer/src/ui/shared/banners/BannerCarousel.module.css`](../renderer/src/ui/shared/banners/BannerCarousel.module.css)
- [`desktop/renderer/src/ui/styles/whats-new.css`](../renderer/src/ui/styles/whats-new.css)

Características:

- Visual consistente e relativamente bem estruturado.
- Update usa lime.
- Defender usa amarelo/laranja forte.
- Carousel usa semântica por estado.
- É uma das áreas mais próximas de um sistema coerente.

### 6.8 Terminal

Arquivo:

- [`desktop/renderer/src/ui/terminal/TerminalPage.tsx`](../renderer/src/ui/terminal/TerminalPage.tsx)

Características:

- Tema do xterm está hardcoded em JS, não em CSS/token.
- Mantém o fundo e cursor do app, mas usa paleta de sintaxe independente:
  - vermelho `#f44747`
  - verde `#6a9955`
  - amarelo `#d7ba7d`
  - azul `#569cd6`
  - magenta `#c586c0`
  - cyan `#4ec9b0`

## 7. Hotspots Críticos Para O Redesign

### 7.1 Arquivos com maior acoplamento visual

- [`desktop/renderer/src/ui/settings/account/AccountTab.module.css`](../renderer/src/ui/settings/account/AccountTab.module.css)
- [`desktop/renderer/src/ui/styles/skill-cards.css`](../renderer/src/ui/styles/skill-cards.css)
- [`desktop/renderer/src/ui/styles/providers-shared.css`](../renderer/src/ui/styles/providers-shared.css)
- [`desktop/renderer/src/ui/chat/components/ChatComposer.module.css`](../renderer/src/ui/chat/components/ChatComposer.module.css)
- [`desktop/renderer/src/ui/settings/OtherTab.module.css`](../renderer/src/ui/settings/OtherTab.module.css)
- [`desktop/renderer/src/ui/terminal/TerminalPage.tsx`](../renderer/src/ui/terminal/TerminalPage.tsx)

### 7.2 Padrões de risco

- Muito `#fff`/`white` hardcoded.
- Muito overlay branco com opacidade específica.
- Muitos estados de provider/skill/modelo não passam por tokens semânticos.
- Componentes de settings têm micro-linguagens visuais próprias.
- Tipografia parcialmente tokenizada.
- `variables.css` sugere um lugar central, mas quase não concentra design.

## 8. Inconsistências Importantes

### 8.1 Tokenização incompleta

- A base define tokens bons para superfícies e estados.
- O consumo real é desigual.
- Vários arquivos usam cores locais em vez de `--success`, `--error`, `--info`, `--warning`.

### 8.2 Azul paralelo

O app usa mais de um “azul oficial”:

- `--info`: `#0d6fff`
- radio de provider: `#1c8af5`
- badges: `#4e95ff`
- `OtherTab`: `#0a84ff`
- alguns toggles/account: `#3b82f6`

### 8.3 Verde/lime paralelo

- CTA global: `#aeff00`
- lime-soft: `#c4ff47`
- success: `#38bb58`
- connected/provider/Google/terminal também introduzem outros verdes

### 8.4 Estilos “fora da família”

- `OtherTab` tem cara de settings nativo Apple.
- Terminal tem tema próprio estilo editor.
- `skill-cards` puxa branding por integração.

## 9. Ordem Recomendada Para Trocar A Identidade

### Fase 1: estabilizar tokens

- Consolidar tokens em um arquivo real de design system.
- Expandir semânticos:
  - `--color-bg-*`
  - `--color-text-*`
  - `--color-brand-*`
  - `--color-status-*`
  - `--color-provider-*` se branding continuar
- Definir tokens tipográficos reais, inclusive família e line-height.

### Fase 2: atacar a base

- [`desktop/renderer/src/ui/styles/base.css`](../renderer/src/ui/styles/base.css)
- [`desktop/renderer/src/ui/styles/kit/*.css`](../renderer/src/ui/styles/kit)
- [`desktop/renderer/src/ui/styles/onboarding-styles.css`](../renderer/src/ui/styles/onboarding-styles.css)
- [`desktop/renderer/src/ui/styles/update-banner.css`](../renderer/src/ui/styles/update-banner.css)

### Fase 3: remover hardcodes por feature

- chat
- settings/account
- providers/models
- skills
- onboarding específico

### Fase 4: tratar exceções separadamente

- decidir se `OtherTab` continua iOS-like ou entra na linguagem principal
- decidir se terminal segue a marca ou continua com tema técnico
- decidir se provider badges continuam multi-cor ou viram sistema mais neutro

## 10. Veredito

O projeto nao tem um design system centralizado de verdade. Ele tem:

- uma base coerente
- alguns patterns bem repetidos
- e muitas exceções locais com cor hardcoded

Se a ideia é mudar a identidade visual inteira, o trabalho principal nao será “trocar variáveis”; será:

1. reforçar os tokens globais
2. reduzir hardcodes por feature
3. decidir quais cores de branding por provider devem permanecer

## 11. Resumo Objetivo

Hoje a identidade do app é:

- dark
- glass leve
- cinza/preto como base
- texto branco frio
- lime como ação principal
- laranja como alerta/brand accent
- azul espalhado sem padrao único
- várias exceções locais em settings, skills, providers e terminal

Se quiser, no próximo passo eu transformo esse mapa em um plano de migração visual por lotes, começando pelos tokens e listando exatamente o que trocar arquivo por arquivo.
