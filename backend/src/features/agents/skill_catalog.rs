//! Suggested skills: a bundled catalog based on the kinds of recipes that are
//! most reused in the community. Nothing is installed or assigned until the
//! user adds one; adding opens the normal skill form so they can pick the Tophs.

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedSkill {
    pub key: String,
    pub name: String,
    pub description: String,
    pub body: String,
    pub category: String,
    pub source: String,
}

fn suggested(
    key: &str,
    name: &str,
    description: &str,
    category: &str,
    body: &str,
) -> SuggestedSkill {
    SuggestedSkill {
        key: key.into(),
        name: name.into(),
        description: description.into(),
        body: body.trim().to_string(),
        category: category.into(),
        source: "Catálogo Toph".into(),
    }
}

/// Curated, dependency-free recipes. The browser one is the same skill Toph
/// already ships for `chrome-devtools-mcp`.
pub fn suggested_skills() -> Vec<SuggestedSkill> {
    let chrome = include_str!("../../../skills/chrome-devtools/SKILL.md");
    vec![
        suggested(
            "chrome-devtools",
            "chrome-devtools",
            "Dirige um Chrome real pelo MCP chrome-devtools para abrir páginas, clicar, ler console/rede e salvar screenshots.",
            "Navegador",
            super::skills::recipe(chrome),
        ),
        suggested(
            "code-review",
            "code-review",
            "Ao revisar um diff, pull request ou mudança antes de integrar.",
            "Qualidade",
            r#"
# Revisão de código

1. Leia o diff inteiro antes de comentar. Entenda o comportamento que mudou, não só o estilo.
2. Procure, nesta ordem: erro de lógica, regressão, caso de borda, problema de concorrência, falha de segurança, teste faltando.
3. Rode os testes e o build que o projeto usa. Se não puder rodar, diga o que ficou sem verificar.
4. Comente com `arquivo:linha`, o impacto concreto e uma sugestão. Separe bloqueante de sugestão.
5. Não reescreva o código sem pedido; a revisão é um diagnóstico.
6. Termine com um veredito: aprovado, aprovado com ressalvas ou precisa mudar.
"#,
        ),
        suggested(
            "tests-first",
            "tests-first",
            "Ao implementar ou corrigir um comportamento que precisa de teste.",
            "Testes",
            r#"
# Teste primeiro

1. Reproduza o comportamento atual com um teste que falha. O teste deve falhar pelo motivo certo.
2. Faça a menor mudança que faz o teste passar.
3. Rode o teste novo e a suíte vizinha; procure regressões.
4. Cubra o caso feliz e pelo menos um caso de borda real.
5. Não ajuste o teste para aceitar um resultado errado. Se o teste estava errado, explique por quê.
6. Relate o comando exato que rodou e o resultado.
"#,
        ),
        suggested(
            "git-release",
            "git-release",
            "Ao preparar um release, changelog ou tag de versão.",
            "Release",
            r#"
# Release

1. Veja o último tag e os commits desde ele (`git describe --tags --abbrev=0` e `git log`).
2. Agrupe as mudanças por tipo: novo, melhoria, correção, interno.
3. Escolha a versão pelo impacto: patch para correção, minor para recurso, major para quebra.
4. Atualize o changelog com linguagem de usuário, sem despejar mensagens de commit cruas.
5. Rode testes, build e uma checagem de versão.
6. Crie o commit e a tag somente depois de tudo passar. Não mova uma tag publicada.
"#,
        ),
        suggested(
            "frontend-design",
            "frontend-design",
            "Ao criar ou melhorar uma interface, tela ou componente visual.",
            "Frontend",
            r#"
# Interface

1. Entenda o fluxo e o estado que a tela representa antes de escolher componentes.
2. Reuse o design system e os padrões que já existem no projeto; não invente um segundo.
3. Cubra os estados: carregando, vazio, erro, sucesso e conteúdo longo.
4. Verifique teclado, foco, contraste e leitores de tela.
5. Teste em uma largura pequena e uma grande; nada deve cortar ou sobrepor.
6. Abra a tela de verdade e confirme o resultado, não só o JSX.
"#,
        ),
        suggested(
            "webapp-testing",
            "webapp-testing",
            "Ao testar um site ou app web real, local ou publicado.",
            "Testes",
            r#"
# Teste de app web

1. Descubra como subir o app e qual URL usar.
2. Abra a página, espere o carregamento e tire um snapshot da árvore de acessibilidade.
3. Interaja por `uid`/referência, uma ação por vez, e confirme com um novo snapshot.
4. Verifique console e rede quando algo falhar.
5. Salve screenshots em arquivo para o usuário ver; não despeje base64 no chat.
6. Relate o caminho percorrido, o que passou e o que falhou com o erro exato.
"#,
        ),
        suggested(
            "security-review",
            "security-review",
            "Ao revisar autenticação, autorização, dados sensíveis ou integrações.",
            "Segurança",
            r#"
# Revisão de segurança

1. Liste as fronteiras de confiança: usuário, servidor, banco, APIs externas.
2. Procure segredos em código, logs e mensagens de erro.
3. Verifique autorização em cada rota, não só autenticação.
4. Procure injeção (SQL, shell, HTML), path traversal, SSRF e upload sem validação.
5. Confira validação de entrada e limite de tamanho.
6. Classifique cada achado por severidade e dê um exemplo concreto de exploração. Não invente vulnerabilidade sem caminho.
"#,
        ),
        suggested(
            "refactor-safe",
            "refactor-safe",
            "Ao refatorar código sem mudar o comportamento externo.",
            "Refatoração",
            r#"
# Refatoração segura

1. Garanta uma linha de base: testes e build passando antes de tocar no código.
2. Faça mudanças pequenas e reversíveis; uma preocupação por vez.
3. Preserve a API pública e o comportamento observável, salvo pedido explícito.
4. Rode os testes depois de cada passo relevante.
5. Não misture refatoração com correção de bug ou recurso novo.
6. No fim, mostre o diff e explique por que o comportamento continua igual.
"#,
        ),
        suggested(
            "docs-writer",
            "docs-writer",
            "Ao escrever ou atualizar README, guia, referência de API ou changelog.",
            "Documentação",
            r#"
# Documentação

1. Defina o leitor e a tarefa que ele quer concluir.
2. Comece pelo caminho mais curto que funciona: pré-requisitos, comando, resultado.
3. Use exemplos reais e copiáveis; confira cada comando.
4. Documente erros comuns e o que fazer.
5. Prefira frases curtas e voz ativa. Remova marketing.
6. Verifique links, nomes de arquivo e versões antes de terminar.
"#,
        ),
        suggested(
            "performance-audit",
            "performance-audit",
            "Ao investigar lentidão, consumo de memória ou custo de uma operação.",
            "Performance",
            r#"
# Performance

1. Meça antes de otimizar. Registre a linha de base com um comando repetível.
2. Encontre o gargalo real com profiling, trace ou logs; não adivinhe.
3. Otimize o gargalo, não o que é fácil de mudar.
4. Meça de novo com a mesma carga e compare.
5. Verifique se a mudança piorou outra dimensão (memória, latência, legibilidade).
6. Relate números antes/depois e o que ficou fora do escopo.
"#,
        ),
        suggested(
            "skill-creator",
            "skill-creator",
            "Ao transformar um processo repetível em uma skill nova ou melhorar uma existente.",
            "Meta",
            r#"
# Criar skill

1. Descreva o tipo de tarefa e o gatilho em uma frase.
2. Liste os passos na ordem real, com comandos exatos.
3. Inclua armadilhas, pré-requisitos e como conferir o resultado.
4. Separe o que é regra do que é exemplo.
5. Teste a receita em uma tarefa real.
6. Envie como proposta; ela só vale depois da aprovação do usuário.
"#,
        ),
        suggested(
            "mcp-builder",
            "mcp-builder",
            "Ao criar ou integrar um servidor MCP com ferramentas para os agentes.",
            "Integrações",
            r#"
# Servidor MCP

1. Defina as ferramentas pelo que o agente precisa fazer, não pelo que a API oferece.
2. Use nomes claros, descrições curtas e schema estrito.
3. Valide toda entrada e devolva erros acionáveis.
4. Não exponha segredos em logs ou resultados.
5. Teste `tools/list` e cada `tools/call` com um caso feliz e um de erro.
6. Documente como conectar e como diagnosticar falha de transporte.
"#,
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_unique_names_and_the_builtin_browser_recipe() {
        let skills = suggested_skills();
        assert!(skills.len() >= 8);
        let mut names = std::collections::HashSet::new();
        for skill in &skills {
            assert!(names.insert(skill.name.clone()), "duplicate {}", skill.name);
            assert!(!skill.description.trim().is_empty());
            assert!(!skill.body.trim().is_empty());
        }
        let chrome = skills
            .iter()
            .find(|skill| skill.key == "chrome-devtools")
            .expect("chrome suggestion");
        assert!(chrome.body.contains("# Chrome DevTools"));
        assert!(!chrome.body.contains("description:"));
    }
}
