# Release OpenSpace Desktop

Execute o release completo do OpenSpace Desktop para a versao `$ARGUMENTS`.

Se nenhuma versao for informada, leia a versao atual de `desktop/package.json` e incremente o patch (ex: 1.0.79 -> 1.0.80).

## Checklist de Release (executar nessa ordem exata)

### 1. Pre-flight checks

- Leia `desktop/package.json` e confirme a versao atual
- Rode `git status` e confirme que nao ha mudancas nao commitadas no repo pai (ignorar o submodule `openclaw` que sempre aparece como modified)
- Verifique se a tag alvo ja existe: `git tag -l v<VERSAO>`. Se existir, avise o usuario e pergunte se quer sobrescrever

### 2. Sync do fork openclaw com upstream

Isso DEVE ser feito ANTES de qualquer bump de versao. O build do CI compila o openclaw e erros de tipo no submodule quebram o release.

```
cd openclaw
git fetch upstream main
git stash  # se houver mudancas locais
git merge upstream/main --no-edit
git stash pop  # se fez stash
git push origin main
cd ..
```

Se o merge falhar por conflitos, PARE e informe o usuario.

### 3. Atualizar submodule no repo pai

```
git add openclaw
git commit -m "chore: sync openclaw submodule with upstream"
```

### 4. Pull rebase do repo pai

```
git pull --rebase origin main
```

Se houver conflito no rebase, PARE e informe o usuario.

### 5. Bump da versao

Edite `desktop/package.json` alterando o campo `version` para a nova versao.

### 6. Commit e push

```
git add desktop/package.json
git commit -m "chore: bump version to <VERSAO>"
git push origin main
```

Se o push for rejeitado (sync workflow commitou durante o processo), faca `git pull --rebase origin main` e tente novamente.

### 7. Criar e pushar tag

Se a tag ja existe localmente ou no remote, limpar antes:
```
git tag -d v<VERSAO> 2>/dev/null
git push origin :refs/tags/v<VERSAO> 2>/dev/null
```

Criar e pushar:
```
git tag v<VERSAO>
git push origin v<VERSAO>
```

### 8. Monitorar build

O push da tag triggera o workflow `Desktop CI` que roda dois jobs de release (mac + windows).

```
gh run list --repo <owner>/<repo> --limit 3
```

Monitore ate ambos os jobs de release (mac e windows) terminarem com sucesso. O job mac leva ~13 min, o Windows ~28 min.

Se falhar, verifique o erro com:
```
gh run view <RUN_ID> --repo <owner>/<repo> --log-failed | grep "##\[error\]"
```

Erros comuns:
- **TS errors no openclaw**: submodule desatualizado, volte ao passo 2
- **eslint errors no desktop**: erros no `verify` job, nao afetam o `release` job (que so roda em tags)

### 9. Publicar release

O electron-builder cria o GitHub Release como **Draft**. E necessario publicar manualmente:

```
gh release edit v<VERSAO> --repo <owner>/<repo> --draft=false
```

Confirme que o release esta publicado:
```
gh release view v<VERSAO> --repo <owner>/<repo>
```

### 10. Validacao final

Informe ao usuario:
- URL do release: `https://github.com/<owner>/<repo>/releases/tag/v<VERSAO>`
- Assets gerados (Mac .zip, Windows .exe, blockmaps, update YMLs)
- Status: publicado como Latest
