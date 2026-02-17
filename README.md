# Wine Agent

A complete wine search and discovery platform with:
- **MCP Server** - Natural language access to wine reviews via Model Context Protocol
- **Web Application** - Search, filter, and chat interface with AI-powered wine recommendations

Access thousands of wine reviews from Google Sheets through conversational language or a beautiful web interface.

## Features

### MCP Server
- **Full-text search** - Search across wine names, brands, reviews, regions, and varietals
- **Advanced filtering** - Filter by price, rating, vintage, region, varietal, and publication date
- **Flexible sorting** - Sort results by any column
- **Date-based queries** - Filter wines by publication or tasting date
- **Natural language** - Designed to work with Claude's natural language understanding

### Web Application
- **Search Interface** - Text search with real-time results
- **Smart Filters** - Filter by varietal, region, wine type, price, rating, and date range
- **AI Chat** - Conversational wine recommendations powered by Claude
- **Mobile Responsive** - Beautiful interface on desktop and mobile
- **Northwest Wine Report Branding** - Styled to match northwestwinereport.com

## Prerequisites

- Node.js 18 or higher
- A Google Cloud Platform account
- A Google Sheet with wine review data

## Project Structure

```
wine-agent/
├── mcp/                      # MCP Server
│   ├── src/                  # Server source code
│   │   ├── index.ts          # Main MCP server
│   │   ├── sheets-client.ts  # Google Sheets integration
│   │   ├── types.ts          # TypeScript types
│   │   └── tools/            # MCP tool implementations
│   ├── credentials/          # Service account credentials (gitignored)
│   ├── dist/                 # Compiled JavaScript (gitignored)
│   ├── package.json
│   └── tsconfig.json
├── web/                      # Web Application
│   ├── server/               # Express API server
│   ├── src/                  # React frontend
│   ├── dist/                 # Built static files
│   └── package.json
├── DEPLOYMENT.md             # EC2 deployment guide
└── README.md
```

## Setup

### MCP Server Setup

### 1. Install Dependencies

```bash
cd mcp
npm install
```

### 2. Google Cloud Platform Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the Google Sheets API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

### 3. Create Service Account

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Give it a name (e.g., "wine-agent-mcp")
4. Click "Create and Continue"
5. Skip the optional permissions steps
6. Click "Done"

### 4. Download Service Account Credentials

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format
5. Click "Create" - this downloads the credentials file

### 5. Configure Credentials

1. Create a `credentials` directory in the `mcp` folder:
   ```bash
   cd mcp
   mkdir credentials
   ```

2. Move the downloaded JSON file to `mcp/credentials/service-account.json`

3. Make sure the credentials directory is in `.gitignore` (it already is!)

### 6. Share Your Google Sheet

1. Open your Google Sheet with wine reviews
2. Click the "Share" button
3. Paste the service account email (found in the credentials JSON file, looks like: `wine-agent-mcp@project-id.iam.gserviceaccount.com`)
4. Give it "Viewer" permissions
5. Click "Share"

### 7. Get Your Sheet ID

Your Sheet ID is in the URL when viewing the sheet:
```
https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
```

Copy that `SHEET_ID` for the next step.

### 8. Build the MCP Server

```bash
cd mcp
npm run build
```

## Configure Claude Desktop

Add this server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wine-agent": {
      "command": "node",
      "args": ["/absolute/path/to/wine-agent/mcp/dist/index.js"],
      "env": {
        "GOOGLE_SHEET_ID": "your-sheet-id-here",
        "GOOGLE_SHEET_NAME": "Sheet1",
        "GOOGLE_SHEET_RANGE": "A:Q",
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/wine-agent/mcp/credentials/service-account.json"
      }
    }
  }
}
```

**Important**: Replace the paths and Sheet ID with your actual values!

- `GOOGLE_SHEET_ID`: Your Google Sheet ID from step 7
- `GOOGLE_SHEET_NAME`: The name of the tab/sheet (default: "Sheet1")
- `GOOGLE_SHEET_RANGE`: The range to read (default: "A:Q" reads all rows, columns A-Q)
- `GOOGLE_APPLICATION_CREDENTIALS`: Absolute path to your `mcp/credentials/service-account.json` file

## Restart Claude Desktop

After updating the configuration, restart Claude Desktop for the changes to take effect.

## Usage Examples

Once configured, you can ask Claude natural language questions about your wine database:

- "Find me the highest rated wines under $40 from the past six months"
- "Show me recent reviews from Quilceda Creek"
- "Search for wines with 'cherry' and 'oak' in the tasting notes"
- "What are the best Pinot Noirs from Oregon?"
- "Show me all red wines rated 4 stars or higher under $50"
- "Get details for La Crema Pinot Noir"
- "What columns are available in the wine database?"

## Available Tools

The MCP server provides these tools:

### `search_wines`
Full-text search across wine names, brands, reviews, regions, AVAs, and varietals.

**Parameters:**
- `query` (required): Search terms
- `limit` (optional): Max results (default: 20)
- `sort_by` (optional): Column to sort by
- `sort_order` (optional): "asc" or "desc" (default: "desc")

### `filter_wines`
Filter wines by specific criteria with comparison operators.

**Parameters:**
- `filters` (required): Object with column-value pairs
  - String columns: `mainVarietal`, `type`, `region`, `ava`, `brandName`
  - Numeric columns: `price`, `rating`, `vintage` (use operators like ">4", "<50")
  - Date columns: `publicationDate`, `tastingDate` (use operators with ISO dates)
- `limit` (optional): Max results (default: 20)
- `sort_by` (optional): Column to sort by
- `sort_order` (optional): "asc" or "desc"

### `get_wine_details`
Retrieve complete information about a specific wine.

**Parameters:**
- `wine_name` (required): Full or partial wine name
- `exact_match` (optional): Require exact match (default: false)

### `list_columns`
Show all available columns in the database.

## Expected Sheet Structure

The server expects these columns in your Google Sheet:

- **ID** - Unique identifier
- **Brand Name** - Wine producer
- **Wine Name** - Name of the wine
- **AVA** - American Viticultural Area
- **Vintage** - Year
- **$** - Price (with $ symbol)
- **Rating** - Star rating (e.g., "*** 1/2")
- **Review** - Full text review/tasting notes
- **Region** - Geographic region
- **Type** - Wine type (Red, White, etc.)
- **Main Varietal** - Grape variety
- **Tasting Date** - Date tasted
- **Publication Date** - Date published
- **Setting** - Tasting setting
- **Purchased/Provided** - How wine was acquired
- **Temp (if not standard)** - Serving temperature
- **Hyperlink** - URL to full review

## Web Application Setup

The web application provides a beautiful interface for searching wines and chatting with an AI sommelier.

### 1. Install Web Dependencies

```bash
cd web
npm install
```

### 2. Configure Environment

Create a `web/.env` file with:

```bash
# Google Sheets credentials (same as MCP server)
GOOGLE_SHEET_ID=your-sheet-id-here
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_SHEET_RANGE=A:Q
GOOGLE_APPLICATION_CREDENTIALS=../mcp/credentials/service-account.json

# Anthropic API key for AI chat feature
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Build and Run

**Development:**
```bash
cd web
npm run dev:all
```

This runs both the React dev server (port 5173) and Express API (port 3001).

**Production:**
```bash
# Build MCP server first
cd mcp && npm run build

# Build web app
cd ../web
VITE_BASE_PATH=/wwr-search npm run build

# Serve with your web server (Nginx, Apache, etc.)
```

See `DEPLOYMENT.md` for detailed EC2 deployment instructions.

## Development

### MCP Server Scripts

```bash
cd mcp
npm run build  # Compile TypeScript to JavaScript
npm start      # Run the compiled server
npm run dev    # Watch mode for development
```

### Web App Scripts

```bash
cd web
npm run dev:all     # Run frontend + backend in development
npm run dev         # Frontend only (Vite dev server)
npm run dev:server  # Backend only (Express API)
npm run build       # Build for production
```

## Performance

- Loads ~5000 wine records (~5-10MB) into memory on startup
- All searches and filters operate on cached data (no API calls per query)
- Fast response times for all queries (milliseconds)
- Manual data refresh can be added if needed

## Troubleshooting

### MCP Server Issues

**"No data found in sheet"**
- Verify the sheet name matches `GOOGLE_SHEET_NAME`
- Check that the range `GOOGLE_SHEET_RANGE` is correct
- Ensure the first row contains column headers

**Authentication errors**
- Verify the service account email is shared with the Google Sheet
- Check that `GOOGLE_APPLICATION_CREDENTIALS` points to the correct JSON file in `mcp/credentials/`
- Ensure the Google Sheets API is enabled in your GCP project

**Server won't start**
- Make sure you've run `npm run build` in the `mcp/` directory
- Verify `GOOGLE_SHEET_ID` is set correctly
- Check that all environment variables use absolute paths

### Web App Issues

**No data loading**
- Verify the Express server is running (check port 3001)
- Check that `web/.env` has correct Google Sheets credentials
- Ensure the MCP server is built (`cd mcp && npm run build`)
- Check browser console for API errors

**Chat not working**
- Verify `ANTHROPIC_API_KEY` is set in `web/.env`
- Check that the API key is valid and active
- Look for errors in the Express server logs

**Build failures**
- Make sure Node.js 18+ is installed
- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check that you're building the MCP server first: `cd mcp && npm run build`

## License

MIT
