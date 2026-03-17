import os
from jinja2 import Template
import logging

logger = logging.getLogger(__name__)

U_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volVectorField; object U; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 1 -1 0 0 0 0];
internalField   uniform ({{ velocity }} 0 0);

boundaryField {
    inlet {
        type            fixedValue;
        value           uniform ({{ velocity }} 0 0);
    }
    outlet {
        type            zeroGradient;
    }
    foil {
        type            noSlip; // Water "sticks" to the foil surface
    }
    walls {
        type            empty; // Simplified 2D simulation for MVP
    }
}"""

P_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volScalarField; object p; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;

boundaryField {
    inlet {
        type            zeroGradient;
    }
    outlet {
        type            fixedValue;
        value           uniform 0;
    }
    foil {
        type            zeroGradient;
    }
    walls {
        type            empty;
    }
}"""

CONTROL_DICT_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object controlDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

application     simpleFoam;
startFrom       latestTime;
startTime       0;
stopAt          endTime;
endTime         {{ max_iterations }}; // Usually 500 for steady-state MVP
deltaT          1;
writeControl    runTime;
writeInterval   {{ write_interval }}; // Save every X steps for the UI to update
purgeWrite      2; // Only keep the last 2 results to save disk space
writeFormat     ascii;
writePrecision  6;"""

SHM_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; object snappyHexMeshDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

castellatedMesh true;
snap            true;
addLayers       false; // Keep false for MVP to ensure stability

geometry {
    foil.stl {
        type triSurfaceMesh;
        name foil;
    }
}

castellatedMeshControls {
    maxLocalCells 1000000;
    maxGlobalCells 2000000;
    
    refinementSurfaces {
        foil {
            level (3 4); // Min/Max refinement level
        }
    }
    
    // CRITICAL: Tells OpenFOAM where the "Water" is.
    // Must be a point OUTSIDE the foil but INSIDE the bounding box.
    locationInMesh ({{ loc_x }} {{ loc_y }} {{ loc_z }}); 
}

snapControls {
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 30;
    nRelaxIter 5;
}"""

class TemplateManager:
    """
    Manages the generation of OpenFOAM dictionary files (controlDict, U, p, etc.)
    using Jinja2 templates based on variables from the user UI payload.
    """
    def __init__(self, case_dir):
        self.case_dir = case_dir
        # Ensure base directories exist
        os.makedirs(os.path.join(self.case_dir, "0"), exist_ok=True)
        os.makedirs(os.path.join(self.case_dir, "system"), exist_ok=True)
        os.makedirs(os.path.join(self.case_dir, "constant"), exist_ok=True)

    def write_file(self, relative_path, template_str, context):
        """Renders a template string with context and writes it to the case directory."""
        template = Template(template_str)
        rendered = template.render(**context)
        file_path = os.path.join(self.case_dir, relative_path)
        with open(file_path, "w") as f:
            f.write(rendered)
        logger.info(f"Generated {relative_path}")

    def initialize_case(self, velocity, water_density, location_in_mesh=(0.5, 0.5, 0.5), max_iterations=500, write_interval=50):
        """
        Generates the initialized OpenFOAM dict structures based on user inputs.
        """
        logger.info(f"Writing Configuration Dicts for Case: Velocity={velocity}, Density={water_density}")
        
        # 1. Write the Velocity (U) dict
        self.write_file("0/U", U_TEMPLATE, {"velocity": velocity})
        
        # 2. Write the Pressure (p) dict (Required to prevent solver crash)
        self.write_file("0/p", P_TEMPLATE, {})
        
        # 3. Write the controlDict (The simulation brain)
        self.write_file("system/controlDict", CONTROL_DICT_TEMPLATE, {
            "max_iterations": max_iterations,
            "write_interval": write_interval
        })
        
        # 4. Write the snappyHexMeshDict (The mesh shrink-wrap rules)
        self.write_file("system/snappyHexMeshDict", SHM_TEMPLATE, {
            "loc_x": location_in_mesh[0],
            "loc_y": location_in_mesh[1],
            "loc_z": location_in_mesh[2]
        })
