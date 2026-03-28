import { apiClient } from "../../shared/api/client";

export type OpportunityTagCatalogItem = {
  id: string;
  slug: string;
  name: string;
  tagType: string;
};

export type OpportunityTagCatalogCategory = {
  id: string;
  slug: string;
  name: string;
  tagType: string;
  items: OpportunityTagCatalogItem[];
};

type OpportunityTagCatalogApiItem = {
  id: string;
  slug: string;
  name: string;
  tag_type: string;
};

type OpportunityTagCatalogApiCategory = {
  id: string;
  slug: string;
  name: string;
  tag_type: string;
  items: OpportunityTagCatalogApiItem[];
};

type OpportunityTagCatalogResponse = {
  data?: {
    items?: OpportunityTagCatalogApiCategory[];
  };
};

export async function listOpportunityTagCatalogRequest(): Promise<OpportunityTagCatalogCategory[]> {
  const response = await apiClient.get<OpportunityTagCatalogResponse>("/tags/catalog");
  const items = response.data?.data?.items ?? [];

  return items.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    tagType: category.tag_type,
    items: category.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      tagType: item.tag_type,
    })),
  }));
}
