from __future__ import annotations

import contextlib
import typing

import asgi_lifespan
import httpx

if typing.TYPE_CHECKING:
    from starlette.types import ASGIApp


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


async def app_request(
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
