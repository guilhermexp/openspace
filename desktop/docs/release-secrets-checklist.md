# OpenSpace Release Secrets Checklist

Este guia cobre os valores esperados pela pipeline de release do Electron em:

- [.github/workflows/build-desktop.yml](../../.github/workflows/build-desktop.yml)
- [desktop/package.json](../package.json)
- [desktop/scripts/electron-builder.afterSign-notarize.cjs](../scripts/electron-builder.afterSign-notarize.cjs)
- [desktop/scripts/electron-builder.afterAllArtifactBuild-notarize-dmg.cjs](../scripts/electron-builder.afterAllArtifactBuild-notarize-dmg.cjs)

## Onde configurar no GitHub

No repositório alvo (`<owner>/<repo>`):

1. `Settings`
2. `Secrets and variables`
3. `Actions`

Crie os itens abaixo.

## Mínimo para auto-update funcionar

Sem assinatura/notarização, o fluxo de auto-update já funciona se a release por tag conseguir publicar os assets no GitHub Release.

`Secrets`

- nenhum extra além do `GITHUB_TOKEN` padrão do Actions

`Variables`

- nenhuma obrigatória

Resultado:

- macOS publica `.zip`, `.blockmap`, `latest-mac.yml`
- Windows publica `.exe`, `.blockmap`, `latest.yml`
- download manual continua vindo de `.dmg` e `.exe`

## Recomendado para release distribuível

### 1. Code signing

`Secrets`

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `CSC_NAME`

### 2. Notarização macOS

`Variable`

- `OPENSPACE_NOTARIZE=1`

`Secrets`

- use `NOTARYTOOL_PROFILE`

ou:

- `NOTARYTOOL_KEY`
- `NOTARYTOOL_KEY_ID`
- `NOTARYTOOL_ISSUER`

## O que cada secret faz

`CSC_LINK`

- certificado de assinatura que o `electron-builder` importa no runner

`CSC_KEY_PASSWORD`

- senha do arquivo do certificado

`CSC_NAME`

- nome exato da identidade
- exemplo comum:
  `Developer ID Application: Seu Nome (TEAM_ID)`

`NOTARYTOOL_PROFILE`

- profile salvo no keychain para `xcrun notarytool`
- costuma ser mais chato de automatizar em CI hospedada

`NOTARYTOOL_KEY`

- conteúdo ou path da chave `.p8` de App Store Connect API key

`NOTARYTOOL_KEY_ID`

- Key ID da API key

`NOTARYTOOL_ISSUER`

- Issuer ID da App Store Connect API key

`OPENSPACE_NOTARIZE`

- se for `1`, os hooks de notarização rodam
- se estiver vazio ou ausente, assinatura pode ocorrer, mas notarização é pulada

## Como gerar o `CSC_LINK`

O caminho mais comum é exportar o certificado como `.p12` no Keychain do macOS e converter para base64.

### Exportar o certificado

No `Keychain Access`:

1. localize o certificado `Developer ID Application`
2. exporte como `.p12`
3. defina uma senha forte

### Converter para base64

```bash
base64 -i OpenSpace-DeveloperID.p12 | pbcopy
```

Cole o valor copiado em `CSC_LINK`.

Se preferir o formato explícito:

```text
data:application/x-pkcs12;base64,<BASE64_DO_P12>
```

Na prática, o `electron-builder` costuma aceitar o base64 direto.

### Descobrir o `CSC_NAME`

```bash
security find-identity -p codesigning -v
```

Procure a linha da identidade `Developer ID Application` e copie o nome completo entre aspas.

## Como gerar os dados de notarização

### Opção recomendada para CI: App Store Connect API key

No Apple Developer / App Store Connect:

1. crie uma API key para notarização
2. baixe o arquivo `.p8`
3. guarde:
   - `KEY_ID`
   - `ISSUER_ID`
   - arquivo `.p8`

No GitHub:

- `NOTARYTOOL_KEY`
  pode ser o conteúdo da `.p8`
- `NOTARYTOOL_KEY_ID`
  valor do `KEY_ID`
- `NOTARYTOOL_ISSUER`
  valor do `ISSUER_ID`

Se quiser guardar o conteúdo da chave em base64 e reconstruir no workflow no futuro, isso também funciona, mas o workflow atual espera a variável já pronta para o `notarytool`.

## Secrets opcionais que não bloqueiam release

O pipeline também tolera ausência das credenciais do `gog`.

Você só precisa disso se quiser empacotar o segredo OAuth do `gog`:

- `OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH`
- ou `OPENCLAW_GOG_OAUTH_CLIENT_SECRET_B64`
- ou `OPENCLAW_GOG_OAUTH_CLIENT_SECRET_JSON`

Sem isso:

- a build não quebra
- apenas o segredo do `gog` não é pré-embutido

## Checklist de configuração

Para colocar em produção com update automático:

1. criar tag `vX.Y.Z`
2. garantir que o workflow publique no GitHub Release
3. verificar que a release draft contém:
   - `.dmg`
   - `.zip`
   - `latest-mac.yml`
   - `.exe`
   - `latest.yml`
   - `.blockmap`

Para ficar assinado/notarizado:

1. configurar `CSC_LINK`
2. configurar `CSC_KEY_PASSWORD`
3. configurar `CSC_NAME`
4. configurar `OPENSPACE_NOTARIZE=1`
5. configurar `NOTARYTOOL_KEY` ou `NOTARYTOOL_PROFILE`

## Bootstrap automático via script

Se você já tiver os arquivos locais, pode subir quase tudo com um comando:

```bash
REPO=<owner>/repo \
CSC_P12_PATH=~/certs/OpenSpace-DeveloperID.p12 \
CSC_KEY_PASSWORD='SUA_SENHA_DO_P12' \
CSC_NAME='Developer ID Application: Seu Nome (TEAM_ID)' \
NOTARYTOOL_KEY_PATH=~/certs/AuthKey_ABC123XYZ.p8 \
NOTARYTOOL_KEY_ID='ABC123XYZ' \
NOTARYTOOL_ISSUER='00000000-0000-0000-0000-000000000000' \
OPENSPACE_NOTARIZE=1 \
bash desktop/scripts/configure-github-release-secrets.sh
```

Script:

- [configure-github-release-secrets.sh](../scripts/configure-github-release-secrets.sh)

## Smoke test final

Depois da primeira release:

1. instale uma versão antiga localmente
2. publique uma versão nova com tag maior
3. abra o app empacotado
4. confirme que:
   - o banner de update aparece
   - o download acontece
   - o restart instala a nova versão

## Observação importante

Hoje o app usa `GitHub provider` para updates.

Isso significa:

- você pode hospedar `DMG` e `EXE` no seu site para download manual
- mas o update automático continua lendo os assets do GitHub Release

Se quiser mover o feed de update para seu site, o próximo passo é trocar de `GitHub provider` para `generic provider`.
