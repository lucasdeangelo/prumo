# Prumo · app (React Native)

O mesmo Prumo do web, como app nativo para Android e iOS: as mesmas telas, textos, regras e dados.
Expo SDK 58 + Expo Router, TypeScript estrito.

## Como funciona

O app **não reimplementa regras de negócio**. Ele conversa com o app web (Next.js), que continua sendo
o único lugar com acesso privilegiado ao banco:

```text
App ── login direto no Supabase (chave pública) ─────────────► Supabase Auth
 │
 └─ Authorization: Bearer <token> ─► /api/mobile/screen/<rota web>  ─► mesmas consultas das páginas
                                   ─► /api/mobile/action/<nome>     ─► mesmas server actions
```

- `GET /api/mobile/screen/overview`, `/monthly/2026-11`, `/cards?card=…&m=1`… devolvem os dados que a
  página web equivalente renderiza, já calculados (`lib/mobile/screens/`).
- `POST /api/mobile/action/<nome>` executa **a mesma server action** do formulário web
  (`lib/mobile/actions.ts`). Validação, privacidade, auditoria e avisos são idênticos.
- O token é verificado como o cookie do web (`lib/auth/session.ts`). O espaço Meu/Nosso vai no header
  `x-prumo-space` (`lib/space.ts`).
- As funções puras de `lib/domain` (formatar valores, datas, recorrências) são compartilhadas com o
  web via alias `@domain/*`, sem cópia.

As rotas do app espelham as do web (`src/app/(app)/monthly/[month].tsx` ↔ `app/(app)/monthly/[month]/page.tsx`).

## Rodando

Requisitos: Node 20+, o app web rodando (local ou publicado) e um dispositivo/emulador.

```bash
cp .env.example .env          # URL do web e chaves públicas do Supabase
npm install
npx expo run:android          # ou npx expo run:ios (gera o build de desenvolvimento)
```

O app usa módulos nativos (SecureStore, WebView do Pluggy, seletor de data, captura de imagem), então
precisa de um build de desenvolvimento, não do Expo Go. Para builds na nuvem: `npx eas-cli@latest build`.

No Android físico, `EXPO_PUBLIC_API_URL` precisa ser o IP da máquina na rede (ex.: `http://192.168.0.10:3000`),
não `localhost`.

### Versão de produção (APK)

O APK aponta para o servidor de produção (`EXPO_PUBLIC_API_URL` = `APP_URL`) e é baixado em
`APP_URL/download/prumo.apk`. Passo a passo em `docs/DEPLOY.md`, seção “App Android”.

## Desempenho

- Dados prontos do servidor: o Início recebe os totais do gráfico de 6 meses, não milhares de movimentações.
- Cache em memória (React Query): voltar a uma tela é instantâneo e ela se atualiza em segundo plano.
  As abas principais são pré-carregadas logo após o login e o mês anterior é buscado antes do toque.
- Lista do Mês virtualizada (FlashList) e filtros por tag/tipo aplicados no aparelho, sem rede.
- Gráficos desenhados em SVG, sem biblioteca de gráficos; só os 5 pesos de fonte usados vão no app.
- Nada financeiro é gravado em disco. A sessão fica no Keychain/Keystore (SecureStore).

## Diferenças em relação ao web

| Web | App |
| --- | --- |
| Widget Pluggy no navegador | Componente oficial `react-native-pluggy-connect` |
| `window.open` para o MeuPluggy | Navegador interno (expo-web-browser) |
| Seletor de cor livre ao criar tag | Paleta com as cores do design system |
| `<input type="month">` no prazo da meta | Lista dos próximos 60 meses |
| Página “Criar nova senha” | O link do e-mail abre o web, onde a senha é trocada |
| Hover nas linhas | Destaque ao tocar |

## Comandos

```bash
npm run typecheck
npm run lint
npx expo-doctor
```
