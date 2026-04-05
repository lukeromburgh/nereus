# Task stubs removed — the real implementations live in simulation_worker/tasks.py.
# Django dispatches tasks using celery_app.send_task('tasks.run_hydro_simulation', ...)
# instead of importing stubs, to avoid @shared_task overwriting the real worker
# task when the worker bootstraps Django.
