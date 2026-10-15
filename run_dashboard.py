"""
Launch the Fault-Diagnosis + XAI dashboard.

Production (frontend already built to frontend/dist):
    python run_dashboard.py
    -> open http://localhost:8000

Development (hot-reload frontend):
    terminal 1:  python run_dashboard.py          # API on :8000
    terminal 2:  cd frontend && npm run dev        # UI on :5173 (proxies /api -> :8000)
"""
import os
import uvicorn

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    dist = os.path.join(HERE, "frontend", "dist")
    if os.path.isdir(dist):
        print("Frontend build found -> dashboard at  http://localhost:8000")
    else:
        print("No frontend build. For dev run in a second terminal:")
        print("    cd frontend && npm install && npm run dev   (UI on http://localhost:5173)")
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)
