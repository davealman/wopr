# WOPR — War Operation Plan Response

WarGames (1983) terminal simulation with Ollama AI integration.

## Start

```bash
# 1. ollama-stack must be running first (creates the ollama-net network)
cd ~/ollama-stack && docker compose up -d

# 2. Start WOPR
cd ~/wopr && docker compose up -d
```

Open **http://localhost:1983** in your browser.

## Stop

```bash
docker compose down
```

## Stack

| Component | Detail |
|---|---|
| Container | `nginx:alpine` |
| Port | 1983 |
| Network | `ollama-net` (external — from ollama-stack) |
| Ollama | `http://localhost:11434` (browser calls host directly) |

## Login

| Username | Password |
|---|---|
| FALKEN | JOSHUA |
| LIGHTMAN | JOSHUA |
| DAVID | JOSHUA |
| GUEST | JOSHUA |

## Games

Select by number or name. Global Thermonuclear War triggers the canvas simulation.
Tic-Tac-Toe leads to the famous conclusion after 3 games.

## AI Settings (coming next)

Settings panel in-terminal — configure Ollama URL and model.
Default: `http://localhost:11434`
