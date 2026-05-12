![](https://img.shields.io/badge/Built%20with%20%E2%9D%A4%EF%B8%8F-at%20Technologiestiftung%20Berlin-blue)

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

# WFS-Explorer

One of the most important sources for (open) geospatial data is the Web Feature Service (WFS). WFS provides geographic features—such as points, lines, or polygons — along with associated attribute data in a standardized way over the internet. It enables precise, up-to-date, and machine-readable information to be retrieved.

Despite its technical capabilities, WFS is often underutilized. The reason: without specialized knowledge or appropriate software—such as Geographic Information Systems (GIS)—many potential users find it difficult to access and process the data for their own needs.

This is where the WFS Explorer comes in. The tool acts as a clear and user-friendly web interface that allows even non-experts to explore and filter WFS data according to their needs. It builds a bridge between the complexity of geospatial services and practical applications by people with varying levels of experience. The tool is also available in German.

### Geospatial Data at a Glance

With the WFS Explorer, users can interactively explore individual WFS datasets. This can be done either by entering any WFS URL manually or by selecting a sample dataset provided by the Geoportal Berlin.

### Features

- Metadata Display: Access to additional information such as dataset descriptions, contact information, projection details, and licensing terms.

- Map Preview: An interactive map view offers a quick overview of the spatial extent and geometry structure of the dataset.

- Attribute Filtering: A user-friendly filter allows datasets to be narrowed down based on specific attribute values.

- Tabular Attribute View: A clean tabular overview of all attributes and an automatic summary of their contents help users explore and analyze the data—making it easy to understand what information is contained in the dataset.

- GeoJSON Export: The dataset can be exported as a GeoJSON file using the widely supported WGS 84 projection (EPSG:4326), enabling seamless integration into other applications.

- CSV Export: The dataset can be exported as a CSV file without the geometries. This can be helpful if you are only interested in the data attributes.

- Direct URL Access: The WFS Explorer supports loading datasets via URL parameters. When a specific WFS URL is passed to the tool, the corresponding dataset is automatically loaded—ideal for embedding into other websites or workflows.

## URL Parameters

The WFS Explorer can be preconfigured via URL parameters. This makes it easy to open a specific dataset directly, apply predefined filters, or provide a list of datasets for search and selection. When a WFS dataset is loaded and filters are applied in the interface, the corresponding URL parameters are set automatically.

### Parameters

- `wfs`  
  The URL of the WFS service that should be loaded automatically.

- `filters`  
  A URL-encoded JSON array of filter objects that should be applied when the dataset is loaded.  
  Each filter object contains:
  - `attribute`: the field name
  - `operator`: the comparison operator
  - `value`: the filter value

- `datasets`  
  The URL to a `services-internet.json` file, as used by the [Masterportal](https://bitbucket.org/geowerkstatt-hamburg/masterportal/src) software. All datasets listed in this JSON file are added to the search. If an entry is a WMS, the application also checks whether a corresponding WFS is available. Example which loads the services from Berlins Masterportal:
  - https://wfsexplorer.odis-berlin.de/?datasets=https://gdi.berlin.de/viewer/_shared/resources/services-internet.json

### About Web Feature Service (WFS)

The WFS Explorer is built on the Web Feature Service (WFS) standard, defined by the Open Geospatial Consortium (OGC). WFS provides geospatial data in a structured, machine-readable format—including both geometry (e.g., points, lines, polygons) and corresponding attribute data. What makes this format particularly powerful is its standardized API: regardless of the data provider, WFS endpoints follow a consistent protocol and can thus be queried in a uniform way.

The WFS Explorer leverages this interface, using key operations such as GetCapabilities, DescribeFeatureType, and GetFeature to automatically retrieve structured information from WFS services. This includes available layers, data structures (attribute names and types), and the actual geospatial data. Important metadata such as projection info, licensing terms, or contact details can also be extracted systematically.

## Code

Please notes that this project first draft was originally written by AI and then developed further. This may have resulted in some redundant code.

## Prerequisites

- Node.js
- npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/wfs-data-analyzer-tool.git
   cd odis-wfsexplorer
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start the development server:

   ```bash
   pnpm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Contributing

Before you create a pull request, write an issue so we can discuss your changes.

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://hanshack.com/"><img src="https://avatars.githubusercontent.com/u/8025164?v=4?s=64" width="64px;" alt="Hans Hack"/><br /><sub><b>Hans Hack</b></sub></a><br /><a href="https://github.com/technologiestiftung/odis-geoexplorer/commits?author=hanshack" title="Code">💻</a> <a href="#content-hanshack" title="Content">🖋</a> <a href="#data-hanshack" title="Data">🔣</a> <a href="https://github.com/technologiestiftung/odis-geoexplorer/commits?author=hanshack" title="Documentation">📖</a> <a href="#projectManagement-hanshack" title="Project Management">📆</a></td>
            <td align="center" valign="top" width="14.28%"><a href="https://github.com/Lisa-Stubert"><img src="https://avatars.githubusercontent.com/u/61182572?v=4?s=64" width="64px;" alt="Lisa-Stubert"/><br /><sub><b>Lisa-Stubert</b></sub></a><br /><a href="#review-Lisa-Stubert" title="Review">👀</a> <a href="#projectManagement-Lisa-Stubert" title="Project Management">📆</a></td>
            <td align="center" valign="top" width="14.28%"><a href="https://github.com/KlemensM"><img src="https://avatars.githubusercontent.com/u/98896505?v=4?s=64" width="64px;" alt="Klemens"/><br /><sub><b>Klemens</b></sub></a><br /><a href="#content-KlemensM" title="Content">🖋</a> <a href="#projectManagement-KlemensM" title="Project Management">📆</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://fhp.incom.org/profile/9200/projects"><img src="https://avatars.githubusercontent.com/u/46717848?v=4?s=64" width="64px;" alt="anna"/><br /><sub><b>anna</b></sub></a><br /><a href="#review-annameide" title="Review">👀</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## Content Licensing

Texts and content available as [CC BY](https://creativecommons.org/licenses/by/3.0/de/).

## Credits

<table>
  <tr>
      <td>
      Made by: <a href="https://odis-berlin.de">
        <br />
        <br />
        <img width="200" src="https://logos.citylab-berlin.org/logo-odis-berlin.svg" />
      </a>
    </td>
    <td>
       Together with: <a href="https://citylab-berlin.org/de/start/">
        <br />
        <br />
        <img width="200" src="https://logos.citylab-berlin.org/logo-citylab-berlin.svg" />
      </a>
    </td>
    <td>
      A project by <a href="https://www.technologiestiftung-berlin.de/">
        <br />
        <br />
        <img width="150" src="https://logos.citylab-berlin.org/logo-technologiestiftung-berlin-de.svg" />
      </a>
    </td>
    <td>
      Supported by <a href="https://www.berlin.de/rbmskzl/">
        <br />
        <br />
        <img width="80" src="https://logos.citylab-berlin.org/logo-berlin-senatskanzelei-de.svg" />
      </a>
    </td>
  </tr>
</table>

## Related Projects

```

```
