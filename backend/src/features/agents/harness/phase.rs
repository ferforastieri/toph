#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Research,
    Plan,
    Implement,
}

impl Phase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Research => "research",
            Self::Plan => "plan",
            Self::Implement => "implement",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Research => "Pesquisando o projeto",
            Self::Plan => "Montando o plano",
            Self::Implement => "Implementando",
        }
    }
}
