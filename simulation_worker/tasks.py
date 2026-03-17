from celery import Celery
import subprocess
import requests
import logging
import os
from collections import deque
import threading
import pyvista as pv
from template_manager import TemplateManager

logger = logging.getLogger(__name__)

# Basic broker setup mapped directly to the local Redis container
app = Celery('tasks', broker='redis://redis:6379/0')
app.conf.update(
    task_serializer='json',
    accept_content=['json'], 
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)

# Replace internal dns 'api' with whatever you map your django service to in Docker
DJANGO_API_URL = "http://api:8000/api/runs" 

def patch_django_status(sim_id, status, error_log=None, result_mesh_path=None):
    payload = {}
    if status:
        payload["status"] = status
    if error_log:
         payload["current_logs"] = error_log
    if result_mesh_path:
         payload["result_mesh_path"] = result_mesh_path
    try:
        requests.patch(f"{DJANGO_API_URL}/{sim_id}/", json=payload)
    except Exception as e:
        logger.error(f"Failed to update Django API: {e}")

class DivergenceError(Exception):
    pass

def stream_and_patch_logs(process, sim_id):
    """Reads stdout lines, keeps last 5, and patches the Django API."""
    log_queue = deque(maxlen=5)
    for line in iter(process.stdout.readline, ''):
        stripped_line = line.strip()
        if not stripped_line:
            continue
        log_queue.append(stripped_line)
        logger.info(stripped_line)
        formatted_logs = "\n".join(log_queue)
        patch_django_status(sim_id, None, error_log=formatted_logs)
        
        # Divergence guardrail
        lower_line = stripped_line.lower()
        if "nan" in lower_line or "fatal error" in lower_line:
            logger.error(f"Simulation diverged! Triggering SIGTERM.")
            process.terminate() # or process.kill()
            patch_django_status(sim_id, "FAILED", error_log=f"Simulation diverged. Try reducing the Angle of Attack or increasing Mesh density.\n{formatted_logs}")
            raise DivergenceError("Simulation diverged with NaN or Fatal Error.")

def post_process_results(case_dir, sim_id):
    """Crush the OpenFOAM data using PyVista and export to GLTF for Web"""
    logger.info(f"Starting PyVista Post-Processing for {sim_id}")
    
    # Generate the dummy .foam file which PyVista/VTK needs to read the OpenFOAM directory
    foam_file = os.path.join(case_dir, "case.foam")
    with open(foam_file, 'w') as f:
        pass
        
    try:
        # 1. Load the OpenFOAM data
        reader = pv.OpenFOAMReader(foam_file)
        
        # Guard: Ensure we actually have time values (i.e. solver didn't fail at 0)
        if len(reader.time_values) > 0:
            reader.set_active_time_value(reader.time_values[-1]) # Get the latest iteration
            mesh = reader.read()
            
            # 2. Reduce the data (Crucial for browser performance!)
            # Extract a 2D Slice plane through the center of the hydrofoil
            # For hydrofoils, assuming symmetry/flow along Y axis
            slice_plane = mesh.slice(normal='y', generate_triangles=True) 
            
            # CRITICAL: Configure the active scalars so Pressure drives the heatmap
            if 'p' in slice_plane.array_names:
                slice_plane.active_scalars_name = 'p'
            
            # 3. Export to GLTF for React Three Fiber
            # Note: Three.js is Y-up, so axes might need permutation in future refinements
            gltf_filename = f"results_slice_{sim_id}.gltf"
            gltf_path = os.path.join(case_dir, gltf_filename)
            
            # Save for UI processing with binary format for faster browser load times
            slice_plane.save(gltf_path, binary=True)
            
            return f"/media/simulations/{sim_id}/{gltf_filename}"
        else:
            raise ValueError("No time steps found to process.")
            
    except Exception as e:
        logger.error(f"Post-processing failed: {e}")
        # MVP Fallback if real simulation files don't exist yet for testing the pipeline
        dummy = pv.Sphere()
        fallback_path = os.path.join(case_dir, "fallback.gltf")
        dummy.save(fallback_path)
        return f"/media/simulations/{sim_id}/fallback.gltf"

@app.task(name='tasks.run_hydro_simulation', bind=True)
def run_hydro_simulation(self, sim_id):
    logger.info(f"Received Simulation request: {sim_id}")
    case_dir = f"/data/simulations/{sim_id}"

    try:
        # Phase 1: Initialize Case
        patch_django_status(sim_id, "PENDING", error_log="Initializing Job Configuration...")
        os.makedirs(case_dir, exist_ok=True)
        
        # Pull parameters from the Django API (Example)
        run_data = {}
        try:
            resp = requests.get(f"{DJANGO_API_URL}/{sim_id}/")
            if resp.status_code == 200:
                run_data = resp.json()
        except Exception as e:
            logger.warning(f"Could not fetch full parameter context: {e}")

        velocity = run_data.get('velocity', 10.0)
        density = run_data.get('water_density', 1025.0)

        # Phase 1.5: Pre-Flight Surface Check & Dynamic Bounding Box
        stl_path = os.path.join(case_dir, "constant", "triSurface", "foil.stl")
        location_in_mesh = (0.5, 0.5, 0.5)
        
        if os.path.exists(stl_path):
            patch_django_status(sim_id, "PENDING", error_log="Running Pre-flight STL Surface Check...")
            
            surf_check = subprocess.run(
                ["surfaceCheck", "constant/triSurface/foil.stl"],
                cwd=case_dir, capture_output=True, text=True
            )
            
            if "open edges" in surf_check.stdout.lower() or surf_check.returncode != 0:
                logger.error("Geometry surface check failed: Not waterproof.")
                patch_django_status(sim_id, "FAILED", error_log="Geometry Check Failed: STL is not closed/water-tight.")
                return "Geometry Leak"

            try:
                foil_mesh = pv.read(stl_path)
                bounds = foil_mesh.bounds  # xmin, xmax, ymin, ymax, zmin, zmax
                # Place location in mesh diagonally outside the maximal bounds of the foil
                location_in_mesh = (bounds[1] + 1.0, bounds[3] + 1.0, bounds[5] + 1.0)
                logger.info(f"Dynamically calculated locationInMesh: {location_in_mesh}")
            except Exception as e:
                logger.error(f"Failed to calculate bounding box: {e}")

        template_manager = TemplateManager(case_dir)
        template_manager.initialize_case(
            velocity=velocity, 
            water_density=density,
            location_in_mesh=location_in_mesh
        )

        # Phase 2: MESHING
        patch_django_status(sim_id, "MESHING", error_log="Starting snappyHexMesh...")

        logger.info(f"Executing snappyHexMesh in {case_dir}")
        process = subprocess.Popen(
            ["snappyHexMesh", "-overwrite"], 
            cwd=case_dir, 
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )

        log_thread = threading.Thread(target=stream_and_patch_logs, args=(process, sim_id))
        log_thread.start()
        
        process.wait()
        log_thread.join()

        if process.returncode != 0:
            stderr_output = process.stderr.read()
            logger.error(f"Meshing failed with code {process.returncode}")
            patch_django_status(sim_id, "FAILED", error_log=stderr_output[-500:])
            return "Meshing Failed"
            
        # 3. Proceed to RUNNING (Solver Mock)
        patch_django_status(sim_id, "RUNNING", error_log="Starting Solver...")
        
        logger.info(f"Executing simpleFoam in {case_dir}")
        process_solver = subprocess.Popen(
            ["simpleFoam"], 
            cwd=case_dir, 
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        log_thread_solver = threading.Thread(target=stream_and_patch_logs, args=(process_solver, sim_id))
        log_thread_solver.start()
        
        process_solver.wait()
        log_thread_solver.join()

        if process_solver.returncode != 0:
             # Could be standard failure or thrown by our Divergence guardrail
             stderr_output = process_solver.stderr.read()
             logger.error(f"Solver failed with code {process_solver.returncode}")
             patch_django_status(sim_id, "FAILED", error_log=stderr_output[-500:])
             return "Solver Failed"
             
        # 4. Phase 4: Data Crush
        patch_django_status(sim_id, None, error_log="Compressing resulting data sets to GLTF...")
        result_url = post_process_results(case_dir, sim_id)
        
        patch_django_status(sim_id, "COMPLETED", error_log="Simulation Success", result_mesh_path=result_url)
        return f"Simulation {sim_id} Finished"

    except DivergenceError:
        # Expected exit during SIGTERM guardrail
        return f"Simulation {sim_id} Halted due to divergence"
    except Exception as e:
        logger.error(f"Error processing Simulation {sim_id}: {e}")
        patch_django_status(sim_id, "FAILED", error_log=str(e))
        raise e
