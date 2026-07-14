exports.handler = async () => {
  const token = process.env.SQUARE_PRODUCTION_TOKEN;
  const res = await fetch("https://connect.squareup.com/v2/catalog/list", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();

  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: data.errors }) };
  }

  const objects = data.objects || [];

  const items = objects
    .filter((o) => o.type === "ITEM")
    .map((o) => ({
      id: o.id,
      name: o.item_data.name,
      description: o.item_data.description || "",
      variations: (o.item_data.variations || []).map((v) => ({
        id: v.id,
        name: v.item_variation_data.name,
        price: v.item_variation_data.price_money?.amount || 0,
      })),
      modifierListIds: (o.item_data.modifier_list_info || []).map((m) => m.modifier_list_id),
    }));

  const modifierLists = objects
    .filter((o) => o.type === "MODIFIER_LIST")
    .map((o) => ({
      id: o.id,
      name: o.modifier_list_data.name,
      modifiers: (o.modifier_list_data.modifiers || []).map((m) => ({
        id: m.id,
        name: m.modifier_data.name,
        price: m.modifier_data.price_money?.amount || 0,
      })),
    }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, modifierLists }),
  };
};
