# Changelog

## 1.1.0 - 2026-03-08

### Added
- Ferramenta de comparação Swipe com controle visual, divisor arrastável e seleção de camadas raster.
- Integração de módulos de Land Cover (frontend e backend) com rotas e serviços dedicados.
- Redimensionamento da sidebar com persistência de largura e alça de resize.
- Estrutura inicial de mapa 3D e componentes auxiliares.
- Testes backend para fluxos de landcover e busca STAC.

### Changed
- Reestruturação do MapView para suportar swipe, painéis e controles avançados de interação.
- Atualizações de estilo para painéis, carrossel e controles de mapa.
- Ajustes no backend principal para integração dos novos módulos.

### Notes
- Backend: suíte de testes em `backend/tests` validada.
- Frontend: build TypeScript ainda possui débitos de tipagem legados fora do escopo desta consolidação.
