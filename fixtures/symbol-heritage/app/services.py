from app.models import Model, User


class Service(Model):
    pass


class Admin(User, metaclass=type):
    pass
