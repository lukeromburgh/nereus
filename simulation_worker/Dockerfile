FROM openfoam/openfoam11-paraview510

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
	python3 \
	python3-pip \
	&& rm -rf /var/lib/apt/lists/*

ENV PIP_BREAK_SYSTEM_PACKAGES=1

RUN pip3 install --no-cache-dir --upgrade pip \
	&& pip3 install --no-cache-dir celery redis pyvista meshio jinja2 requests trimesh pygltflib \
	   "Django>=4.2,<5" djangorestframework django-cors-headers

COPY . /app
WORKDIR /app

CMD ["bash", "-lc", "source /opt/openfoam11/etc/bashrc && celery -A tasks worker --loglevel=info"]