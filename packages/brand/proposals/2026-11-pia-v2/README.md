# Toph — logo original com olhos + 30 personagens

## Direção confirmada: opção A

A própria silhueta da logo atual é o corpo do `toph-logo`: três barras decrescentes, com dois olhos pretos ovais e brilho branco **na barra superior**. O ponto inferior da referência original também é preservado. Material 3D brilhante em degradê laranja, fundo branco e sombra suave. Referência: `apps/web/public/brand/toph-mark.png`.

Os demais 30 personagens têm silhuetas distintas, dois olhos ovais com brilho e traços no topo quando aplicável. Todos os PNGs finais são 1024 × 1024.

Variante adicional solicitada: `originals/toph-logo-sorriso.png`, preservando a logo-base e acrescentando um sorriso pequeno em relevo na segunda barra. A coleção possui 31 arquivos-base mais essa variante (32 PNGs).

Os arquivos da rodada anterior foram removidos de `originals/` conforme confirmação do usuário. O script `prepare.py`, os catálogos `preview-brand*`, `preview-silhuetas*`, o manifest antigo de marca e a pasta `superseded-recolors/` pertencem a rodadas anteriores e não descrevem esta entrega.

## Arquivos desta rodada

Pasta: `packages/brand/proposals/2026-11-pia-v2/originals/`.

| Arquivo | Silhueta |
| --- | --- |
| `toph-logo.png` | Logo original com olhos nas próprias barras |
| `toph-logo-sorriso.png` | Variante adicional com sorriso na segunda barra |
| `toph-01.png` | Tulipa |
| `toph-02.png` | Cogumelo |
| `toph-03.png` | Borboleta |
| `toph-04.png` | Coração |
| `toph-05.png` | Raio |
| `toph-06.png` | Cacto |
| `toph-07.png` | Concha |
| `toph-08.png` | Bolota |
| `toph-09.png` | Folha |
| `toph-10.png` | Chama |
| `toph-11.png` | Floco de neve |
| `toph-12.png` | Quebra-cabeça |
| `toph-13.png` | Hexágono |
| `toph-14.png` | Laço |
| `toph-15.png` | Ampulheta |
| `toph-16.png` | Avião de papel |
| `toph-17.png` | Barco de papel |
| `toph-18.png` | Sino |
| `toph-19.png` | Ferradura |
| `toph-20.png` | Coroa |
| `toph-21.png` | Pretzel |
| `toph-22.png` | Dupla hélice |
| `toph-23.png` | Arraia |
| `toph-24.png` | Abóbora |
| `toph-25.png` | Broto |
| `toph-26.png` | Cristais |
| `toph-27.png` | Bumerangue |
| `toph-28.png` | Bolha |
| `toph-29.png` | Leque |
| `toph-30.png` | Espiral |

## Preparação e revisão

Após a conclusão dos jobs, executar (requer Pillow):

```sh
python3 -B packages/brand/proposals/2026-11-pia-v2/prepare-31.py
```

O script ajusta tamanho e fundo dos PNGs, verifica cada arquivo e produz:

- `preview-31-tophs.webp`: catálogo visual completo.
- `manifest-31.json`: silhueta, cor, dimensões, bytes e SHA-256 de cada arquivo.
- `paths-31.txt`: lista completa dos 31 caminhos absolutos.

Para revisar somente um lote já concluído, usar `--batch toph-01 toph-02 toph-03 toph-04`.

Na integração, exportar imagens nos tamanhos de uso (por exemplo 64/128/256 px) e servi-las por URL com dimensões explícitas. Os PNGs 1024 px são os originais de produção.
