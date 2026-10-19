# FretLab

Ferramenta para aulas de guitarra, com braço interativo, identificação de acordes e escalas e criação de materiais para os alunos.

## Recursos

- Seleção de notas em até 24 casas, com nomes e destaque para a tônica.
- Modos de exploração, acordes e escalas; afinações alternativas e orientação para canhotos.
- Identificação de acordes, inversões e escalas, distinguindo correspondências exatas de escalas compatíveis.
- Reprodução sonora sintetizada, transposição e exemplos musicais.
- Shapes e rascunhos salvos no navegador.
- Exportação de PNG e PDF com nome do aluno e anotações opcionais.

## Executar localmente

Não é necessário instalar dependências para usar o aplicativo. Com Python 3 instalado, execute na pasta do projeto:

```sh
python -m http.server 8000 --directory dist
```

Abra `http://localhost:8000` no navegador.

## Publicar no GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. O fluxo `.github/workflows/pages.yml` verifica o JavaScript e a análise musical e publica a pasta `dist` após envios à branch `main` ou `master`. Ele também pode ser iniciado manualmente pela aba **Actions**.

O site usa caminhos relativos e pode ser hospedado no subdiretório do repositório.

## Verificar a análise musical

Com Node.js 22:

```sh
node tests/music.cjs
```

## Dados dos alunos

Os shapes, rascunhos e anotações são mantidos no armazenamento local do navegador. Os materiais exportados são gerados no próprio dispositivo. A coleção não é sincronizada entre dispositivos.
