"""Backend tests for the London BC pilot: recipe clone, quickstart flow, human gate."""
import io
import os
import sys
import pytest
import requests

# ensure we can import backend.production for make_pdf_bytes
sys.path.insert(0, "/app/backend")
from production import make_pdf_bytes  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    return sess


def _pdf(w, h, bleed=True, pages=1):
    return make_pdf_bytes(w, h, pages, bleed)


def _upload(sess, pdf_bytes, size_option, stock="Glossy", recipe_id="RECIPE-BC-LONDON-PILOT-V1", filename="test.pdf"):
    files = {"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")}
    data = {"size_option": size_option, "stock": stock, "recipe_id": recipe_id, "customer": "TEST_Customer"}
    return sess.post(f"{API}/production/jobs/quickstart", files=files, data=data, timeout=60)


# ---------- Recipe clone ----------
class TestRecipes:
    def test_pilot_and_v1_recipes_both_active(self, s):
        r = s.get(f"{API}/recipes")
        assert r.status_code == 200
        recipes = {x["recipe_id"]: x for x in r.json() if x.get("recipe_id")}
        assert "RECIPE-BC-LONDON-V1" in recipes
        assert "RECIPE-BC-LONDON-PILOT-V1" in recipes
        v1 = recipes["RECIPE-BC-LONDON-V1"]
        pilot = recipes["RECIPE-BC-LONDON-PILOT-V1"]
        assert v1["status"] == "ACTIVE"
        assert pilot["status"] == "ACTIVE"
        assert v1.get("parameters", {}).get("imposition_template") == "London BC"
        assert pilot.get("parameters", {}).get("imposition_template") == "Jai BC"


# ---------- Quickstart happy paths ----------
class TestQuickstartHappy:
    def test_pilot_size_3_25x2_25_glossy(self, s):
        pdf = _pdf(3.25, 2.25, bleed=True)
        r = _upload(s, pdf, "PILOT_3_25x2_25", stock="Glossy")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["held"] is True
        job = body["job"]
        assert job["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"
        assert job.get("fiery_state") == "HELD_VERIFIED"
        assert job.get("imposition_template") == "Jai BC"
        props = job.get("properties", {})
        assert props.get("size") == "3.25×2.25 (bleed)"
        assert props.get("stock") == "Glossy"
        assert props.get("impose_preset") == "Jai BC"
        # verify GET persistence
        r2 = s.get(f"{API}/production/jobs/{job['id']}")
        assert r2.status_code == 200
        assert r2.json()["job"]["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"

    def test_std_size_3_75x2_25_matte(self, s):
        pdf = _pdf(3.75, 2.25, bleed=True)
        r = _upload(s, pdf, "STD_3_5x2", stock="Matte")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["held"] is True
        job = body["job"]
        assert job["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"
        assert job.get("imposition_template") == "Jai BC"
        props = job.get("properties", {})
        assert props.get("size") == "3.5×2 (no-bleed)"
        assert props.get("stock") == "Matte"


# ---------- Block other sizes / invalid inputs ----------
class TestBlocks:
    def test_wrong_geometry_stops(self, s):
        pdf = _pdf(7.0, 4.0, bleed=False)
        r = _upload(s, pdf, "PILOT_3_25x2_25")
        assert r.status_code == 200
        body = r.json()
        assert body["held"] is False
        assert body.get("stop") and body["stop"].get("code") == "WRONG_DIMENSIONS"

    def test_invalid_size_option_400(self, s):
        pdf = _pdf(3.25, 2.25, bleed=True)
        r = _upload(s, pdf, "A4_POSTER")
        assert r.status_code == 400

    def test_invalid_stock_400(self, s):
        pdf = _pdf(3.25, 2.25, bleed=True)
        r = _upload(s, pdf, "PILOT_3_25x2_25", stock="Neon")
        assert r.status_code == 400

    def test_non_pdf_400(self, s):
        files = {"file": ("bad.txt", io.BytesIO(b"hello world"), "text/plain")}
        data = {"size_option": "PILOT_3_25x2_25", "stock": "Glossy",
                "recipe_id": "RECIPE-BC-LONDON-PILOT-V1", "customer": "TEST_Customer"}
        r = s.post(f"{API}/production/jobs/quickstart", files=files, data=data, timeout=30)
        assert r.status_code == 400


# ---------- Human auth gate preserved ----------
class TestAuthGate:
    def test_ai_actor_rejected_and_human_advances_but_no_print(self, s):
        # create a throwaway held job
        pdf = _pdf(3.25, 2.25, bleed=True)
        r = _upload(s, pdf, "PILOT_3_25x2_25", stock="Glossy")
        assert r.status_code == 200
        job_id = r.json()["job"]["id"]

        # AI actor must be denied
        r_ai = s.post(f"{API}/production/jobs/{job_id}/authorize", json={"actor": "AI", "ai_actor": True})
        assert r_ai.status_code == 403

        # Human authorize -> reaches PRODUCTION_AUTHORIZED (terminal, no print)
        r_h = s.post(f"{API}/production/jobs/{job_id}/authorize", json={"actor": "TEST_Human", "ai_actor": False})
        assert r_h.status_code == 200
        assert r_h.json()["job"]["state"] == "PRODUCTION_AUTHORIZED"

        # Attempting a further advance beyond terminal must 400 (PRINT locked)
        r_a = s.post(f"{API}/production/jobs/{job_id}/advance", json={"actor": "TEST_Human"})
        assert r_a.status_code == 400


# ---------- Regression: legacy create with default recipe uses London BC ----------
class TestLegacyCreate:
    def test_create_job_with_v1_recipe_uses_london_bc(self, s):
        r = s.post(f"{API}/production/jobs", json={
            "tenant_id": "TEN-PRINT2GO", "location_id": "LOC-LONDON",
            "product_code": "PROD-BC-001", "recipe_id": "RECIPE-BC-LONDON-V1",
            "customer": "TEST_LegacyCustomer",
        })
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["imposition_template"] == "London BC"
        assert job["properties"]["impose_preset"] == "London BC"
