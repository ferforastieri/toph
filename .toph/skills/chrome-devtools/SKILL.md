---
name: chrome-devtools
description: Dirige um Chrome headless pelo MCP chrome-devtools-mcp para abrir páginas, clicar, ler console e rede, medir performance e salvar screenshots que o usuário vê no chat. Use quando a tarefa envolver um site ou app web real.
---

# Chrome DevTools

Use o MCP `chrome-devtools` para operar um navegador de verdade. Descubra as
ferramentas disponíveis antes do primeiro uso:

```
mcp_list { "server": "<id do servidor chrome-devtools>" }
```

O servidor sobe com `--slim`, então você tem apenas navegação, execução de
script e screenshot. Se precisar de rede, console ou trace, peça ao usuário para
reconfigurar o servidor sem `--slim`.

## Ordem obrigatória

1. `navigate_page` para abrir a URL.
2. `wait_for` pelo seletor ou texto que precisa existir. Nunca leia imediatamente
   após navegar.
3. `take_snapshot` para obter a árvore de acessibilidade com os `uid`.
4. Interaja pelos `uid`: `click`, `fill`, `press_key`.
5. Repita o snapshot após cada mudança de estado. `uid` antigo é inválido.

Uma ação por vez. Depois de cada ação, confirme com um novo snapshot em vez de
encadear cliques às cegas.

## Screenshots

Screenshot inline em base64 estoura o limite de resposta do Toph. Sempre salve em
arquivo:

```
take_screenshot { "filePath": ".toph/artifacts/<nome>.png" }
```

O Toph lê imagens do projeto e mostra no chat automaticamente, então o usuário vê
exatamente o que você vê. Use nomes descritivos e não sobrescreva prints de
etapas diferentes.

## Regras

- Trabalhe em `localhost` e no que o usuário indicou. Não navegue para fora sem
  pedir.
- Nada de credenciais: se a página exigir login, pare e peça para o usuário
  conectar ou informar o acesso.
- Prefira snapshot a screenshot para decidir o próximo passo; screenshot é para o
  usuário, não para você.
- Se uma ação falhar, tire um snapshot antes de tentar de novo: o estado costuma
  ser diferente do que você assumiu.
- Relate a URL final e o que foi verificado.
