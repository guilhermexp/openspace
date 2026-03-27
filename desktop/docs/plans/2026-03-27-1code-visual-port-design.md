# 1Code Visual Port Design

> Data: 2026-03-27
> Projeto: OpenSpace Desktop
> Status: aprovado para implementacao

## Objetivo

Adaptar a interface atual do OpenSpace Desktop para a linguagem visual do sistema `1Code`, mantendo a stack atual do app:

- React 19
- CSS global + CSS modules
- componentes internos
- sem migracao estrutural para Tailwind/Radix neste momento

## Escopo

### Dentro do escopo

- tokens visuais globais
- shell do app
- botoes, inputs, modais e banners compartilhados
- settings, skills, models, onboarding e chat nos pontos de maior impacto
- alinhamento visual do terminal quando viavel

### Fora do escopo por enquanto

- migracao para Tailwind CSS
- migracao para Radix UI
- suporte completo a tema light/dark com alternancia em runtime
- reescrita total da arquitetura de componentes

## Direcao Visual

Queremos portar do `1Code` principalmente:

- base `off-black` mais seca
- `primary` azul vibrante `#0034FF`
- bordas discretas e limpas
- menos glow e menos glass pesado
- radius menor e mais consistente
- componentes mais compactos e precisos
- texto claro com hierarquia mais controlada

## Compatibilidade Com O App Atual

### O que encaixa bem

- paleta base
- botoes e inputs
- modais e overlays
- tabs de settings
- shell, sidebar e headers
- banners e feedback

### O que exige adaptacao parcial

- skill cards com branding de providers
- badges de modelos/providers
- terminal xterm
- `OtherTab`, que hoje segue uma linguagem visual separada

## Estrategia Tecnica

### Abordagem escolhida

Portar a linguagem visual do `1Code` por cima do sistema atual, sem trocar a infraestrutura.

### Motivo

Isso entrega o maior ganho visual com o menor risco. Migrar agora para Tailwind/Radix aumentaria muito o escopo e atrasaria a entrega sem necessidade para este redesign inicial.

## Tokens Alvo

### Base

- background principal mais proximo de `#0A0A0A`
- superfícies entre `#121212`, `#171717` e `#1C1C1F`
- texto principal claro proximo de `#F4F4F5`
- texto secundario cinza neutro
- `primary` azul `#0034FF`
- destructive vermelho consistente
- bordas escuras discretas

### Ajustes estruturais

- adicionar token de fonte de corpo
- adicionar token de fonte mono
- reduzir dependencia de hardcodes de branco
- preparar base para futura separacao entre `primary`, `accent`, `warning` e `info`

## Lotes De Implementacao

### Lote 1

- `base.css`
- `kit/buttons.css`
- `kit/forms.css`
- `kit/modals.css`
- shell base

### Lote 2

- headers de settings/skills/models
- chat composer
- banners/update states

### Lote 3

- account/settings complexos
- providers/models badges
- skill cards
- terminal

## Riscos

- varias telas usam hardcodes locais
- `lime` hoje concentra CTA; trocar sua semantica precisa cuidado
- `accent` hoje mistura warning com acao
- `OtherTab` tem visual iOS-like e pode destoar ate ser tratado
- o terminal tem tema proprio em JS

## Criterios De Sucesso

- o app deixa de parecer “lime + glass” e passa a parecer “dark editorial + blue primary”
- shell e componentes compartilhados ficam consistentes entre si
- os principais CTA passam a seguir a nova linguagem
- a base fica pronta para lotes seguintes sem retrabalho estrutural

## Testes

- criar teste de design tokens para validar a base visual alvo
- validar que componentes compartilhados usam tokens, nao cores soltas criticas
- rodar a suite de testes do desktop apos o lote inicial

## Observacao

Nao vou tentar reproduzir 100% do `1Code` internamente. O objetivo aqui e fidelidade visual alta com custo tecnico controlado.
