import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fhirProxy from "./routes/fhir-proxy.js";
import appConfig from "./routes/app-config.js";
import fhirSources from "./routes/fhir-sources.js";
import adminSmartConfig from "./routes/admin-smart-config.js";
import smartAuth from "./routes/smart-auth.js";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === "production";

app.use(cors());
app.use(express.json({
  limit: "2mb",
  type: ["application/json", "application/fhir+json", "application/json+fhir"],
}));
app.use("/api/fhir", fhirProxy);
app.use("/api/config", appConfig);
app.use("/api/fhir-sources", fhirSources);
app.use("/api/auth/smart", smartAuth);
app.use("/api/admin", adminSmartConfig);

if (isProduction) {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
