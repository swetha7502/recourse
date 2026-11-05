export type CatalogItem = {
  sku: string;
  title: string;
  variant: string;
  color: string;
  size: string;
  priceCents: number;
  description: string;
  deliveryDays: number;
  nearMiss?: string;
};

export const catalog: CatalogItem[] = [
  { sku: "HOOD-BLK-M", title: "Classic Cotton Pullover Hoodie", variant: "Medium", color: "Black", size: "M", priceCents: 3299, description: "Men's 100% cotton pullover hoodie with kangaroo pocket.", deliveryDays: 3, nearMiss: "HOOD-BLK-L" },
  { sku: "HOOD-BLK-L", title: "Classic Cotton Pullover Hoodie", variant: "Large", color: "Black", size: "L", priceCents: 3299, description: "Men's 100% cotton pullover hoodie with kangaroo pocket.", deliveryDays: 3, nearMiss: "HOOD-BLK-M" },
  { sku: "HOOD-CHR-M", title: "Classic Cotton Pullover Hoodie", variant: "Medium", color: "Charcoal", size: "M", priceCents: 3299, description: "Men's 100% cotton pullover hoodie with kangaroo pocket.", deliveryDays: 3, nearMiss: "HOOD-BLK-M" },
  { sku: "TEE-NVY-M", title: "Everyday Crew Tee", variant: "Medium", color: "Navy", size: "M", priceCents: 1899, description: "Soft organic cotton crew neck tee.", deliveryDays: 2, nearMiss: "TEE-ROY-M" },
  { sku: "TEE-ROY-M", title: "Everyday Crew Tee", variant: "Medium", color: "Royal Blue", size: "M", priceCents: 1899, description: "Soft organic cotton crew neck tee.", deliveryDays: 2, nearMiss: "TEE-NVY-M" },
  { sku: "SHOE-NVY-9", title: "Performance Running Sneakers", variant: "Size 9", color: "Navy", size: "9", priceCents: 6999, description: "Lightweight running shoes with breathable mesh.", deliveryDays: 4, nearMiss: "SHOE-NVY-10" },
  { sku: "SHOE-NVY-10", title: "Performance Running Sneakers", variant: "Size 10", color: "Navy", size: "10", priceCents: 6999, description: "Lightweight running shoes with breathable mesh.", deliveryDays: 4, nearMiss: "SHOE-NVY-9" },
  { sku: "SHOE-ROY-9", title: "Performance Running Sneakers", variant: "Size 9", color: "Royal Blue", size: "9", priceCents: 6999, description: "Lightweight running shoes with breathable mesh.", deliveryDays: 4, nearMiss: "SHOE-NVY-9" },
  { sku: "BOTL-500", title: "Insulated Steel Water Bottle", variant: "500 ml", color: "Silver", size: "500 ml", priceCents: 1999, description: "Double-wall insulated stainless steel bottle.", deliveryDays: 2, nearMiss: "BOTL-750" },
  { sku: "BOTL-750", title: "Insulated Steel Water Bottle", variant: "750 ml", color: "Silver", size: "750 ml", priceCents: 2199, description: "Double-wall insulated stainless steel bottle.", deliveryDays: 2, nearMiss: "BOTL-500" },
  { sku: "PACK-30-BLK", title: "Trail Commuter Backpack", variant: "30 liters", color: "Black", size: "30 liters", priceCents: 5499, description: "Weather-resistant commuter backpack with padded 16-inch laptop sleeve.", deliveryDays: 3, nearMiss: "PACK-20-BLK" },
  { sku: "PACK-20-BLK", title: "Urban Everyday Backpack", variant: "20 liters", color: "Black", size: "20 liters", priceCents: 4500, description: "Compact everyday backpack with padded 13-inch laptop sleeve.", deliveryDays: 3, nearMiss: "PACK-30-BLK" },
  { sku: "PACK-25-NVY", title: "Professional Commuter Backpack", variant: "25 liters", color: "Navy", size: "25 liters", priceCents: 5999, description: "Professional backpack with laptop storage and organizer pockets.", deliveryDays: 5, nearMiss: "PACK-30-BLK" },
  { sku: "CHRG-65", title: "USB-C Fast Charger", variant: "65W", color: "White", size: "65W", priceCents: 2999, description: "USB-C Power Delivery charger rated for 65W output.", deliveryDays: 2, nearMiss: "CHRG-30" },
  { sku: "CHRG-30", title: "USB-C Fast Charger", variant: "30W", color: "White", size: "30W", priceCents: 1799, description: "USB-C Power Delivery charger rated for 30W output.", deliveryDays: 2, nearMiss: "CHRG-65" },
  { sku: "CABL-2M", title: "USB-C Charging Cable", variant: "2 meters", color: "White", size: "2 meters", priceCents: 1199, description: "USB-C to USB-C cable supporting fast charging.", deliveryDays: 2, nearMiss: "CABL-1M" },
  { sku: "CABL-1M", title: "USB-C Charging Cable", variant: "1 meter", color: "White", size: "1 meter", priceCents: 899, description: "USB-C to USB-C cable supporting fast charging.", deliveryDays: 2, nearMiss: "CABL-2M" },
  { sku: "JACK-OLV-M", title: "Waterproof Hiking Jacket", variant: "Medium", color: "Olive", size: "M", priceCents: 7999, description: "Fully waterproof shell with sealed seams and adjustable hood.", deliveryDays: 4, nearMiss: "JACK-WR-OLV-M" },
  { sku: "JACK-WR-OLV-M", title: "Trail Wind Jacket", variant: "Medium", color: "Olive", size: "M", priceCents: 5999, description: "Water-resistant wind shell for light showers.", deliveryDays: 4, nearMiss: "JACK-OLV-M" },
  { sku: "STND-17", title: "Adjustable Aluminum Laptop Stand", variant: "Universal", color: "Silver", size: "Fits laptops up to 17 inches", priceCents: 3499, description: "Adjustable aluminum stand for laptops up to 17 inches.", deliveryDays: 3, nearMiss: "STND-13" },
  { sku: "STND-13", title: "Compact Laptop Stand", variant: "Compact", color: "Silver", size: "Fits laptops up to 13 inches", priceCents: 2499, description: "Foldable stand for laptops up to 13 inches.", deliveryDays: 3, nearMiss: "STND-17" },
  { sku: "MUG-2PK", title: "Stoneware Coffee Mugs", variant: "Set of 2", color: "Oat", size: "12 oz", priceCents: 2400, description: "Handmade stoneware mugs, dishwasher safe.", deliveryDays: 6, nearMiss: "MUG-4PK" },
  { sku: "MUG-4PK", title: "Stoneware Coffee Mugs", variant: "Set of 4", color: "Oat", size: "12 oz", priceCents: 4400, description: "Handmade stoneware mugs, dishwasher safe.", deliveryDays: 6, nearMiss: "MUG-2PK" },
  { sku: "DRSS-PNK-M", title: "Floral Midi Summer Dress", variant: "Medium", color: "Pastel Pink", size: "M", priceCents: 4499, description: "Lightweight floral midi dress for casual outdoor occasions.", deliveryDays: 3, nearMiss: "DRSS-PNK-S" },
  { sku: "DRSS-PNK-S", title: "Floral Midi Summer Dress", variant: "Small", color: "Pastel Pink", size: "S", priceCents: 4499, description: "Lightweight floral midi dress for casual outdoor occasions.", deliveryDays: 3, nearMiss: "DRSS-PNK-M" },
  { sku: "PARK-CHR-M", title: "Insulated Winter Parka", variant: "Medium", color: "Charcoal", size: "M", priceCents: 10999, description: "Insulated winter parka with fleece lining and wind-resistant outer shell.", deliveryDays: 5, nearMiss: "PARK-CHR-L" },
  { sku: "PARK-CHR-L", title: "Insulated Winter Parka", variant: "Large", color: "Charcoal", size: "L", priceCents: 10999, description: "Insulated winter parka with fleece lining and wind-resistant outer shell.", deliveryDays: 5, nearMiss: "PARK-CHR-M" },
];

export const findSku = (sku: string) => catalog.find((item) => item.sku === sku);

export function searchCatalog(query: string, maxPriceCents?: number): CatalogItem[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
  return catalog
    .map((item) => {
      const text = `${item.title} ${item.variant} ${item.color} ${item.size} ${item.description}`.toLowerCase();
      return { item, score: terms.filter((t) => text.includes(t)).length };
    })
    .filter(({ item, score }) => score > 0 && (!maxPriceCents || item.priceCents <= maxPriceCents))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
