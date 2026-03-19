FROM openfoam/openfoam11-paraview510

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
	python3 \
	python3-pip \
	&& rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --upgrade pip \
	&& pip3 install --no-cache-dir celery redis pyvista meshio jinja2 requests trimesh pygltflib
# Cache-bust: increment when source files change
ARG CACHE_BUST=2COPY . /app
WORKDIR /app

CMD ["bash", "-lc", "source /opt/openfoam11/etc/bashrc && celery -A tasks worker --loglevel=info"]