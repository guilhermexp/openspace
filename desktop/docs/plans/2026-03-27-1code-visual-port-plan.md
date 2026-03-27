# 1Code Visual Port Plan

> Data: 2026-03-27
> Baseado em: `2026-03-27-1code-visual-port-design.md`

## Batch 1

- criar teste para tokens visuais alvo
- atualizar tokens globais em `base.css`
- corrigir token faltante `--font-body`
- restilizar botoes compartilhados
- restilizar inputs e estados de foco
- restilizar modais e confirm dialogs
- ajustar shell principal, topbar e elementos base de layout

## Batch 2

- ajustar `ChatComposer`
- ajustar headers de `Settings`, `Skills` e `Models`
- alinhar banners de update/feedback

## Batch 3

- atacar `AccountTab`
- alinhar `providers-shared.css`
- alinhar `skill-cards.css`
- decidir tratamento final de `OtherTab`
- alinhar tema do terminal

## Validacao

- rodar teste criado para tokens
- rodar testes relevantes do desktop
- revisar visualmente os hotspots principais

## Bloqueios conhecidos

- sem skill `writing-plans` nesta sessao
- sem migracao de stack para Tailwind/Radix
- alguns componentes ainda dependem de hardcodes locais
