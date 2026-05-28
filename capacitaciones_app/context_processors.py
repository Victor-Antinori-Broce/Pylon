"""
Context processor para agregar información de permisos de capacitaciones a todas las plantillas.
"""
from .permissions import (
    es_administrador_capacitaciones,
    es_supervisor_capacitaciones,
    es_estudiante_capacitaciones,
    obtener_rol_capacitaciones,
    obtener_grupos_supervisados
)


def capacitaciones_permissions(request):
    """
    Agrega variables de permisos de capacitaciones al contexto de todas las plantillas.
    
    Variables disponibles en templates:
    - es_admin_capacitaciones: bool
    - es_supervisor_capacitaciones: bool
    - es_estudiante_capacitaciones: bool
    - rol_capacitaciones: str ('administrador', 'supervisor', 'estudiante')
    - grupos_supervisados: QuerySet (solo para supervisores)
    """
    if not request.user.is_authenticated:
        return {
            'es_admin_capacitaciones': False,
            'es_supervisor_capacitaciones': False,
            'es_estudiante_capacitaciones': False,
            'rol_capacitaciones': None,
            'grupos_supervisados': None,
        }
    
    es_admin = es_administrador_capacitaciones(request.user)
    es_supervisor = es_supervisor_capacitaciones(request.user)
    es_estudiante = es_estudiante_capacitaciones(request.user)
    rol = obtener_rol_capacitaciones(request.user)
    
    # Obtener grupos supervisados si es supervisor o admin
    grupos = None
    if es_supervisor or es_admin:
        grupos = obtener_grupos_supervisados(request.user)
    
    return {
        'es_admin_capacitaciones': es_admin,
        'es_supervisor_capacitaciones': es_supervisor,
        'es_estudiante_capacitaciones': es_estudiante,
        'rol_capacitaciones': rol,
        'grupos_supervisados': grupos,
    }

