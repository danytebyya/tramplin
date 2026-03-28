from pydantic import BaseModel


class TagCatalogItemRead(BaseModel):
    id: str
    slug: str
    name: str
    tag_type: str


class TagCatalogCategoryRead(BaseModel):
    id: str
    slug: str
    name: str
    tag_type: str
    items: list[TagCatalogItemRead]


class TagCatalogResponse(BaseModel):
    items: list[TagCatalogCategoryRead]
