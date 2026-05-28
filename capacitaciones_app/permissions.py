"""
Funciones helper para verificar permisos en la aplicación de capacitaciones.
Sistema de permisos independiente basado en PerfilUsuario.
"""
from functools import wraps
from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.contrib import messages
from django.db.models import Q
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# FUNCIONES PRINCIPALES DE VERIFICACIÓN DE ROLES
# ============================================================================

def es_administrador_capacitaciones(user):
    """
    Verifica si el usuario es administrador del sistema de capacitaciones.
    
    Retorna True si:
    - Es superusuario
    - Tiene PerfilUsuario con rol 'administrador'
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si es administrador, False en caso contrario
    """
    if not user or not user.is_authenticated:
        return False
        
    if user.is_superuser:
        return True
    
    # Verificar rol en PerfilUsuario
    try:
        return user.perfil.rol_capacitaciones == 'administrador' and user.perfil.activo
    except AttributeError:
        # Si no tiene perfil, intentar fallback a pacifico (temporal)
        logger.warning(f"Usuario {user.username} no tiene PerfilUsuario en capacitaciones")
        return _fallback_check_pacifico_role(user, 'Administrador')


def es_supervisor_capacitaciones(user):
    """
    Verifica si el usuario es supervisor del sistema de capacitaciones.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si es supervisor, False en caso contrario
    """
    if not user or not user.is_authenticated:
        return False
    
    try:
        return user.perfil.rol_capacitaciones == 'supervisor' and user.perfil.activo
    except AttributeError:
        logger.warning(f"Usuario {user.username} no tiene PerfilUsuario en capacitaciones")
        return _fallback_check_pacifico_role(user, 'Supervisor')


def es_estudiante_capacitaciones(user):
    """
    Verifica si el usuario es estudiante del sistema de capacitaciones.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si es estudiante, False en caso contrario
    """
    if not user or not user.is_authenticated:
        return False
    
    try:
        return user.perfil.rol_capacitaciones == 'estudiante' and user.perfil.activo
    except AttributeError:
        logger.warning(f"Usuario {user.username} no tiene PerfilUsuario en capacitaciones")
        # Por defecto, los usuarios sin perfil son estudiantes
        return True


def obtener_rol_capacitaciones(user):
    """
    Obtiene el rol del usuario en el sistema de capacitaciones.
    
    Args:
        user: Usuario de Django
        
    Returns:
        str: 'administrador', 'supervisor', 'estudiante', o None
    """
    if not user or not user.is_authenticated:
        return None
    
    if user.is_superuser:
        return 'administrador'
    
    try:
        if user.perfil.activo:
            return user.perfil.rol_capacitaciones
        return None
    except AttributeError:
        logger.warning(f"Usuario {user.username} no tiene PerfilUsuario en capacitaciones")
        return 'estudiante'  # Default


# ============================================================================
# FUNCIONES DE PERMISOS ESPECÍFICOS
# ============================================================================

def puede_asignar_cursos(user):
    """
    Verifica si el usuario puede asignar cursos a otros usuarios.
    Incluye administradores y supervisores.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si puede asignar cursos
    """
    return es_administrador_capacitaciones(user) or es_supervisor_capacitaciones(user)


def puede_ver_reportes(user):
    """
    Verifica si el usuario puede ver reportes y exportar datos.
    Incluye administradores y supervisores.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si puede ver reportes
    """
    return es_administrador_capacitaciones(user) or es_supervisor_capacitaciones(user)


def puede_gestionar_cursos(user):
    """
    Verifica si el usuario puede crear, editar y eliminar cursos.
    Solo administradores.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si puede gestionar cursos
    """
    return es_administrador_capacitaciones(user)


def puede_gestionar_grupos(user):
    """
    Verifica si el usuario puede crear, editar y eliminar grupos.
    Solo administradores.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si puede gestionar grupos
    """
    return es_administrador_capacitaciones(user)


def puede_ver_dashboard(user):
    """
    Verifica si el usuario puede acceder al dashboard.
    Incluye administradores y supervisores.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si puede ver dashboard
    """
    return es_administrador_capacitaciones(user) or es_supervisor_capacitaciones(user)


# ============================================================================
# FUNCIONES HELPER PARA SUPERVISORES
# ============================================================================

def obtener_grupos_supervisados(user):
    """
    Obtiene los grupos que supervisa un usuario.
    
    Args:
        user: Usuario de Django
        
    Returns:
        QuerySet: GrupoAsignacion supervisados por el usuario
    """
    from .models import GrupoAsignacion
    
    if not user or not user.is_authenticated:
        return GrupoAsignacion.objects.none()
    
    # Administradores ven todos los grupos
    if es_administrador_capacitaciones(user):
        return GrupoAsignacion.objects.all()
    
    # Supervisores solo ven sus grupos
    if es_supervisor_capacitaciones(user):
        return GrupoAsignacion.objects.filter(
            Q(supervisor_principal=user) | 
            Q(supervisores_adicionales=user)
        ).distinct()
    
    # Estudiantes no supervisan grupos
    return GrupoAsignacion.objects.none()


def obtener_usuarios_supervisados(user):
    """
    Obtiene los usuarios que supervisa un usuario (miembros de sus grupos).
    
    Args:
        user: Usuario de Django
        
    Returns:
        QuerySet: Usuarios supervisados
    """
    from django.contrib.auth.models import User
    
    if not user or not user.is_authenticated:
        return User.objects.none()
    
    # Administradores ven todos los usuarios
    if es_administrador_capacitaciones(user):
        return User.objects.filter(is_active=True)
    
    # Supervisores solo ven usuarios de sus grupos
    if es_supervisor_capacitaciones(user):
        grupos_supervisados = obtener_grupos_supervisados(user)
        return User.objects.filter(
            grupos_asignados__in=grupos_supervisados
        ).distinct()
    
    # Estudiantes solo se ven a sí mismos
    return User.objects.filter(id=user.id)


def puede_ver_usuario(supervisor, estudiante):
    """
    Verifica si un supervisor puede ver la información de un estudiante específico.
    
    Args:
        supervisor: Usuario supervisor
        estudiante: Usuario estudiante
        
    Returns:
        bool: True si puede ver al estudiante
    """
    if not supervisor or not estudiante:
        return False
    
    # Administradores ven a todos
    if es_administrador_capacitaciones(supervisor):
        return True
    
    # Supervisores solo ven a usuarios de sus grupos
    if es_supervisor_capacitaciones(supervisor):
        usuarios_supervisados = obtener_usuarios_supervisados(supervisor)
        return estudiante in usuarios_supervisados
    
    # Usuarios solo se ven a sí mismos
    return supervisor.id == estudiante.id


def get_cursos_visibles(user):
    """
    Obtiene los cursos visibles para un usuario según su rol.
    
    Args:
        user: Usuario de Django
        
    Returns:
        QuerySet: Cursos visibles
    """
    from .models import Curso
    
    if not user or not user.is_authenticated:
        return Curso.objects.none()
    
    # Administradores ven todos los cursos
    if es_administrador_capacitaciones(user):
        return Curso.objects.all()
    
    # Supervisores ven cursos asignados a usuarios de sus grupos
    if es_supervisor_capacitaciones(user):
        usuarios_supervisados = obtener_usuarios_supervisados(user)
        return Curso.objects.filter(
            usuarios_asignados__in=usuarios_supervisados
        ).distinct()
    
    # Estudiantes solo ven sus cursos asignados
    return Curso.objects.filter(usuarios_asignados=user)


def get_usuarios_visibles(user):
    """
    Obtiene los usuarios visibles para un usuario según su rol.
    Alias de obtener_usuarios_supervisados para consistencia.
    
    Args:
        user: Usuario de Django
        
    Returns:
        QuerySet: Usuarios visibles
    """
    return obtener_usuarios_supervisados(user)


def validar_supervisor_para_grupo(user):
    """
    Valida si un usuario puede ser asignado como supervisor de un grupo.
    
    Args:
        user: Usuario de Django
        
    Returns:
        bool: True si puede ser supervisor de grupo
    """
    if not user or not user.is_authenticated:
        return False
    
    return es_supervisor_capacitaciones(user) or es_administrador_capacitaciones(user)


# ============================================================================
# DECORADORES DE PERMISOS
# ============================================================================

def require_administrador_capacitaciones(view_func):
    """
    Decorador que requiere permisos de administrador completo de capacitaciones.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not es_administrador_capacitaciones(request.user):
            messages.error(request, 'No tienes permisos suficientes para acceder a esta funcionalidad.')
            return HttpResponseForbidden("Acceso denegado: Se requieren permisos de administrador.")
        return view_func(request, *args, **kwargs)
    return wrapper


def require_puede_asignar_cursos(view_func):
    """
    Decorador que requiere permisos para asignar cursos.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not puede_asignar_cursos(request.user):
            messages.error(request, 'No tienes permisos para asignar cursos.')
            return HttpResponseForbidden("Acceso denegado: Se requieren permisos para asignar cursos.")
        return view_func(request, *args, **kwargs)
    return wrapper


def require_puede_ver_reportes(view_func):
    """
    Decorador que requiere permisos para ver reportes.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not puede_ver_reportes(request.user):
            messages.error(request, 'No tienes permisos para ver reportes.')
            return HttpResponseForbidden("Acceso denegado: Se requieren permisos para ver reportes.")
        return view_func(request, *args, **kwargs)
    return wrapper


def require_rol_capacitaciones(roles):
    """
    Decorador genérico que requiere uno o más roles específicos.
    
    Args:
        roles: Lista de roles permitidos ['administrador', 'supervisor', 'estudiante']
        
    Usage:
        @require_rol_capacitaciones(['administrador', 'supervisor'])
        def mi_vista(request):
            ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            user_role = obtener_rol_capacitaciones(request.user)
            if user_role not in roles:
                messages.error(
                    request, 
                    f'No tienes permisos suficientes. Se requiere uno de los siguientes roles: {", ".join(roles)}'
                )
                return HttpResponseForbidden("Acceso denegado: Rol insuficiente.")
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


# ============================================================================
# FUNCIONES DE FALLBACK (COMPATIBILIDAD TEMPORAL)
# ============================================================================

def _fallback_check_pacifico_role(user, expected_role):
    """
    Función de fallback temporal para verificar roles en pacifico.UserProfile.
    Se usará mientras se completa la migración.
    
    Args:
        user: Usuario de Django
        expected_role: Rol esperado en pacifico
        
    Returns:
        bool: True si el usuario tiene el rol en pacifico
    """
    try:
        if hasattr(user, 'userprofile'):
            return user.userprofile.rol == expected_role
    except Exception as e:
        logger.error(f"Error verificando rol de pacifico para {user.username}: {e}")
    
    return False
