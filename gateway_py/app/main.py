from fastapi import FastAPI
from app.config import settings
from app.grpc_clients.core import clients
from app.services.bot_service import rdb as bot_rdb

from app.api.routers import admin, auth, billing, bots, games, profile, quizzes, system, ws

app = FastAPI(
    title='QuizBattle Gateway API',
    docs_url='/docs',
    openapi_url='/openapi.json',
)

for router in [system.router, auth.router, profile.router, games.router, bots.router, quizzes.router, billing.router, admin.router, ws.router]:
    app.include_router(router)

# compatibility for tests
rdb = bot_rdb

@app.on_event('startup')
async def startup():
    return None

@app.on_event('shutdown')
async def shutdown():
    return None
