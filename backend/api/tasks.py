from celery import shared_task
from .models import SimulationRun

@shared_task(name='tasks.run_hydro_simulation')
def run_hydro_simulation(sim_id):
    # This is a stub on the Django side.
    # The actual execution happens in the simulation_worker container.
    # In a full-stack context, Django just needs this signature to queue
    # the task into Redis.
    pass


@shared_task(name='tasks.preview_stl_orientation')
def preview_stl_orientation(run_id):
    # Stub — actual execution happens in the simulation_worker container.
    pass
