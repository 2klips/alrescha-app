from app.api.routes import router


def test_router():
    assert router() is not None
