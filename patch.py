from __future__ import annotations

def _reset_modules() -> None:
    import sys

    _modules_to_reset = [
        "fastapi",
        "fastapi_pagination",
        "sqlalchemy",
        "starlette",
        "httpx",
        "asgi_lifespan",
        "pydantic",
    ]

    for name in list(sys.modules):
        if any(name.startswith(module) for module in _modules_to_reset):
            del sys.modules[name]

_reset_modules()
del _reset_modules

import asyncio
import contextlib
import typing
import json

import asgi_lifespan
import httpx

if typing.TYPE_CHECKING:
    from starlette.types import ASGIApp

try:
    from sqlalchemy import Engine, event, SelectBase
except ImportError:
    Engine = None
    event = None
    SelectBase = None
else:
    import sys

    if not getattr(sys, "__listener_added__", False):
        @event.listens_for(Engine, "before_execute")
        def receive_before_execute(_, clauseelement, *__):
            if not isinstance(clauseelement, SelectBase):
                return

            query_str = str(clauseelement.compile(compile_kwargs={"literal_binds": True})).strip()

            print(f"SQL Query:\n{query_str}")
            print()

        sys.__listener_added__ = True


def _patch() -> None:
    import typing_extensions

    class Doc:
        def __init__(self, documentation: str):
            self.documentation = documentation

    typing_extensions.Doc = Doc

    from fastapi import concurrency as fastapi_concurrency
    from starlette import concurrency

    class _AnyIOToThread:
        @staticmethod
        async def run_sync(
            func: typing.Any, *args: typing.Any, **_: typing.Any,
        ) -> typing.Any:
            return func(*args)

    class _AnyIOPatch:
        to_thread = _AnyIOToThread()

    concurrency.anyio = _AnyIOPatch()
    fastapi_concurrency.anyio = _AnyIOPatch()


_patch()
del _patch

from fastapi_pagination.utils import disable_installed_extensions_check

disable_installed_extensions_check()

del disable_installed_extensions_check


async def _app_request(
    app: ASGIApp,
    *,
    path: str = "/",
    method: str = "GET",
    **kwargs: typing.Any,
) -> httpx.Response:
    async with contextlib.AsyncExitStack() as stack:
        client = await stack.enter_async_context(
            httpx.AsyncClient(app=app, base_url="http://test.com/"),
        )
        await stack.enter_async_context(asgi_lifespan.LifespanManager(app))

        return await client.request(method, path, **kwargs)


_local_tasks = []


async def _pretty_request(
    app: ASGIApp,
    *,
    path: str = "/",
    method: str = "GET",
    **kwargs: typing.Any,
) -> None:
    response = await _app_request(app, path=path, method=method, **kwargs)

    print(f"{method} {path}")
    print(f"status: {response.status_code}")
    body = json.dumps(response.json(), indent=4)
    print(f"body: {body}")
    print()


def app_request(
    app: ASGIApp,
    *,
    path: str = "/",
    method: str = "GET",
    **kwargs: typing.Any,
) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_pretty_request(app, path=path, method=method, **kwargs))
    else:
        task = loop.create_task(
            _pretty_request(app, path=path, method=method, **kwargs),
        )

        _local_tasks.append(task)
        task.add_done_callback(lambda _: _local_tasks.remove(task))


async def wait_all_tasks() -> None:
    await asyncio.gather(*_local_tasks)
