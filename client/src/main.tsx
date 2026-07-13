import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./App.tsx";
import { FhirSourceProvider } from "./lib/fhir-source-context.tsx";
import { PatientDetailsPage } from "./pages/PatientDetailsPage.tsx";
import { PatientListPage } from "./pages/PatientListPage.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <FhirSourceProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<PatientListPage />} />
            <Route path="patient/:id" element={<PatientDetailsPage />} />
          </Route>
        </Routes>
      </FhirSourceProvider>
    </BrowserRouter>
  </StrictMode>
);
