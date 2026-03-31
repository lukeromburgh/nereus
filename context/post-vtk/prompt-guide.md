Phase 1 — Layers, Features, Gravity, Moments

1. First-layer thickness calculator
   #file:hydro-sim-architecture.md

In tasks.py, add a function `compute_first_layer_thickness(velocity, nu, char_len, y_plus_target)`
using the flat-plate Cf approximation described in section 4.2. Call it in
run_hydro_simulation() after bounding box computation and store the result in a
local variable `y1` to be passed into the template context. 2. snappyHexMeshDict layer addition
#file:hydro-sim-architecture.md

Update the snappyHexMeshDict Jinja2 template in template_manager.py to add the
`addLayersControls` block from section 4.2. Gate it with `{% if enable_layers %}`.
Add the following variables to the template context: enable_layers, n_surface_layers,
layer_expansion, y1 (first layer thickness). 3. surfaceFeatureExtract
#file:hydro-sim-architecture.md

Add a new Jinja2 template for `system/surfaceFeatureExtractDict` as shown in section 4.3.
Then in run_hydro_simulation() in tasks.py, insert a call to surfaceFeatureExtract
(via run_openfoam_cmd) before the blockMesh step. Update snappyHexMeshDict to include
the features block referencing foil.eMesh. 4. Gravity and p_rgh
#file:hydro-sim-architecture.md

Add two new templates: `constant/g` and `0/p_rgh` from sections 4.1 and 4.4.
In render_templates() in template_manager.py, render g and p_rgh when enable_gravity
is True, and render the standard p template otherwise. Add enable_gravity to the
SimulationRun model as a BooleanField defaulting to True. 5. Moment extraction in post-processing
#file:hydro-sim-architecture.md

In the post-processing section of tasks.py, add parsing of moment.dat from
postProcessing/forces/0/moment.dat. Extract My, Mx, Mz averaged over the last 20%
of time steps, as shown in section 8. Store pitch_moment, roll_moment, yaw_moment
on the SimulationRun model and include them in the results dict patched back to Django. 6. Wall y+ extraction
#file:hydro-sim-architecture.md

In the controlDict Jinja2 template, add the `yPlus` function object block from section 4.6.
In post_process() in tasks.py, read the yPlus field from the foilSurface boundary
and compute wall_yplus_max and wall_yplus_mean as shown in section 8. Patch these
onto the SimulationRun model.

Phase 2 — Solver Type, VTK Export, Parallelisation 7. Solver type model field and template dispatch
#file:hydro-sim-architecture.md

Add solver_type as a CharField with choices ['simpleFoam','pimpleFoam','interFoam']
to SimulationRun in models.py. In template_manager.py, implement the render_templates()
dispatch function from section 9 that selects controlDict, transportProperties,
and velocity BC templates based on solver_type. 8. pimpleFoam controlDict template
#file:hydro-sim-architecture.md

Create a new Jinja2 template for system/controlDict targeting pimpleFoam, using the
dictionary from section 4.6. Include end_time, delta_t, max_cfl, write_interval,
the forces function object, the yPlus function object, and the fieldAverage block.
Add end_time, delta_t, max_cfl as FloatFields on SimulationRun. 9. Parallel decomposition
#file:hydro-sim-architecture.md

Add n_parallel_cores as an IntegerField (default 1) to SimulationRun. Add a
decomposeParDict Jinja2 template using the scotch method from section 4.8.
In run_hydro_simulation() in tasks.py, add the conditional decomposePar + mpirun
logic from section 4.8, and call reconstructPar after the solver finishes if parallel. 10. VTK/VTP export in post-processing
#file:hydro-sim-architecture.md

Replace the current STL-only post-processing in tasks.py with the expanded
post_process() function from section 8. Export foil_surface.vtp and volume.vtu
using PyVista when export_vtk is True. Compute Umag and Cp fields on the internal
mesh before export. Add export_vtk and export_fields as model fields. 11. Turbulence parameter exposure
#file:hydro-sim-architecture.md

Replace the hardcoded turbulence_intensity (0.05) and turbulence_length (0.1) values
in template_manager.py with variables read from the SimulationRun model. Add
turbulence_intensity and turbulence_length as FloatFields on the model. Update the
k, omega, and nut template context to use these values.

Phase 3 — Free Surface and Propulsion 12. interFoam templates
#file:hydro-sim-architecture.md

Create three new Jinja2 templates: 0/alpha.water, constant/transportProperties for
two-phase flow, and a controlDict variant for interFoam, all from sections 4.5 and 9.
Add enable_free_surface as a BooleanField on SimulationRun. Wire these into the
render_templates() dispatch when solver_type is interFoam. 13. fvSchemes and fvSolution for transient/VOF
#file:hydro-sim-architecture.md

Create solver-specific fvSchemes and fvSolution templates for pimpleFoam and interFoam
using the dictionaries in sections 13 and 14. The interFoam fvSolution must include
the alpha.water solver block with MULESCorr and the PIMPLE outer corrector settings.
Gate template selection on solver_type in render_templates(). 14. Propulsion equilibrium solver
#file:hydro-sim-architecture.md

Add propulsion_model, thrust_force, wind_speed, wind_angle, sail_area, kite_area,
cl_sail, cd_sail as fields on SimulationRun. Implement the solve_equilibrium_velocity()
function from section 5.1 in a new file propulsion.py. Call it in Phase 0 of
run_hydro_simulation() when propulsion_model != 'none', and update run.velocity
with the result before rendering templates.

Phase 4 — PID and 6DOF 15. PID model fields
#file:hydro-sim-architecture.md

Add all PID-related fields from section 3 to SimulationRun in models.py: enable_pid,
the nine Kp/Ki/Kd values for ride height, pitch, and velocity controllers, and the
three target setpoints. Generate and run the Django migration. 16. PIDController class and control loop
#file:hydro-sim-architecture.md

Create a new file pid.py containing the PIDController class and pid_control_loop()
function exactly as specified in section 7. Then in run_hydro_simulation() in tasks.py,
call pid_control_loop() after the initial solver run when enable_pid is True, passing
the case_dir, run, and parsed forces. 17. dynamicMeshDict for 6DOF
#file:hydro-sim-architecture.md

Create a Jinja2 template for constant/dynamicMeshDict using the sixDoFRigidBodyMotion
config from section 4.7. Add enable_6dof and moment_of_inertia (ArrayField, size 6)
to SimulationRun. In render_templates(), render dynamicMeshDict and a pointDisplacement
BC template when enable_6dof is True.

Phase 5 — Sweep Engine 18. Parameter sweep data model
#file:hydro-sim-architecture.md

Add is_sweep_job, sweep_parameter, sweep_values, and parent_run (self-referential FK)
to SimulationRun in models.py as shown in section 3. Add the result aggregation
fields: equilibrium_velocity, lift_force, drag_force, l_d_ratio, pitch_moment,
roll_moment, yaw_moment. Generate and run the migration. 19. Sweep launcher task
#file:hydro-sim-architecture.md

In tasks.py, implement the launch_parameter_sweep() and aggregate_sweep_results()
Celery tasks from section 11. Use a Celery chord to fan out child runs and aggregate
once all complete. The aggregation should build a summary dict with parameter, values,
lift, drag, l_d, and moments arrays and write it to a sweep_summary.json in the
parent run's output directory. 20. Frontend ConfigPanel additions
#file:hydro-sim-architecture.md

In ConfigPanel.tsx, add the new UI panels from section 10: SolverPanel (solver type,
end time, CFL, cores), MeshPanel additions (layer toggle, y+ target, layer count),
TurbulencePanel (TI and L_ref inputs), PropulsionPanel (model select with conditional
fields), PIDPanel (gated behind enable_pid toggle), and OrientationPanel (pitch/roll/yaw
with 6DOF toggle). Each panel should bind to the existing Zustand store pattern.

A few tips on using these effectively in Copilot:

Run them in order — later prompts assume earlier ones have landed (e.g. prompt 15 assumes 7 added solver_type)
After each prompt, ask a follow-up: "Write a unit test for the function you just added" before moving on
For the model/migration prompts (4, 7, 15, 18), follow immediately with: "Generate the Django migration file for these changes"
Prompts 12–13 are the most complex — if Copilot produces incomplete output, split them further by asking for one template at a time
