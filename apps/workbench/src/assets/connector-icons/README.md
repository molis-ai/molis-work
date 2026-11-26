# Connector brand marks

The mark of the one platform service that has a brand: TypeSafe, from the [official website](https://typesafe.ai/) (trademark of its owner). `../../connector-marks.ts` embeds it. Model API, Images API and generic MCP use the application's Lucide symbols because they do not represent one provider.

Every other service's mark is declared by the integration package that owns the service (`IntegrationDrivers.marks`); its sources are in that package's `assets/marks`. Settings renders each mark in an isolated SVG image, preserving internal gradient and style IDs without collisions: a 24px contained image centered in a 40px light surface with an 8px safe area in both themes, brand aspect ratios intact.
