"""
Vistas para gestión de perfiles de usuario en capacitaciones
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.http import JsonResponse
from django.db.models import Q, Count
from django.utils import timezone
from django.views.decorators.http import require_POST
import json

from .models import PerfilUsuario, GrupoAsignacion
from .permissions import require_administrador_capacitaciones, es_administrador_capacitaciones


@login_required
@require_administrador_capacitaciones
def gestionar_perfiles(request):
    """
    Vista principal para gestionar perfiles de usuarios en capacitaciones.
    Solo accesible para administradores.
    """
    # Obtener filtros
    rol_filter = request.GET.get('rol', '')
    activo_filter = request.GET.get('activo', '')
    search = request.GET.get('search', '')
    grupo_filter = request.GET.get('grupo', '')
    vista = request.GET.get('vista', 'lista')  # 'lista' o 'grupos'
    
    # Query base
    perfiles = PerfilUsuario.objects.select_related('user').prefetch_related('user__grupos_asignados').all()
    
    # Aplicar filtros
    if rol_filter:
        perfiles = perfiles.filter(rol_capacitaciones=rol_filter)
    
    if activo_filter:
        perfiles = perfiles.filter(activo=(activo_filter == 'true'))
    
    if search:
        perfiles = perfiles.filter(
            Q(user__username__icontains=search) |
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(user__email__icontains=search)
        )
    
    if grupo_filter:
        perfiles = perfiles.filter(user__grupos_asignados__id=grupo_filter)
    
    # Ordenar por username
    perfiles = perfiles.order_by('user__username')
    
    # Estadísticas
    stats = {
        'total': PerfilUsuario.objects.count(),
        'administradores': PerfilUsuario.objects.filter(rol_capacitaciones='administrador', activo=True).count(),
        'supervisores': PerfilUsuario.objects.filter(rol_capacitaciones='supervisor', activo=True).count(),
        'estudiantes': PerfilUsuario.objects.filter(rol_capacitaciones='estudiante', activo=True).count(),
        'inactivos': PerfilUsuario.objects.filter(activo=False).count(),
        'total_grupos': GrupoAsignacion.objects.count(),
        'sin_grupo': User.objects.filter(is_active=True, grupos_asignados__isnull=True).count(),
    }
    
    # Usuarios sin perfil
    usuarios_sin_perfil = User.objects.filter(
        is_active=True
    ).exclude(
        perfil__isnull=False
    ).count()
    
    # Obtener grupos con estadísticas
    grupos = GrupoAsignacion.objects.annotate(
        total_miembros=Count('usuarios_asignados', distinct=True),
        supervisores_count=Count('supervisores_adicionales', distinct=True)
    ).prefetch_related(
        'supervisor_principal',
        'supervisores_adicionales',
        'usuarios_asignados__perfil'
    ).order_by('nombre')
    
    # Agrupar usuarios por grupo (para vista de grupos)
    grupos_con_usuarios = []
    if vista == 'grupos':
        for grupo in grupos:
            usuarios_grupo = []
            for usuario in grupo.usuarios_asignados.all():
                try:
                    perfil = usuario.perfil
                    usuarios_grupo.append({
                        'usuario': usuario,
                        'perfil': perfil,
                    })
                except:
                    pass
            
            grupos_con_usuarios.append({
                'grupo': grupo,
                'usuarios': usuarios_grupo,
            })
        
        # Usuarios sin grupo
        usuarios_sin_grupo = User.objects.filter(
            is_active=True,
            grupos_asignados__isnull=True
        ).prefetch_related('perfil')
        
        usuarios_sin_grupo_list = []
        for usuario in usuarios_sin_grupo:
            try:
                perfil = usuario.perfil
                usuarios_sin_grupo_list.append({
                    'usuario': usuario,
                    'perfil': perfil,
                })
            except:
                pass
    else:
        usuarios_sin_grupo_list = []
    
    context = {
        'perfiles': perfiles,
        'stats': stats,
        'usuarios_sin_perfil': usuarios_sin_perfil,
        'rol_filter': rol_filter,
        'activo_filter': activo_filter,
        'search': search,
        'grupo_filter': grupo_filter,
        'vista': vista,
        'roles': PerfilUsuario.ROL_CHOICES,
        'grupos': grupos,
        'grupos_con_usuarios': grupos_con_usuarios,
        'usuarios_sin_grupo': usuarios_sin_grupo_list,
    }
    
    return render(request, 'capacitaciones_app/gestionar_perfiles.html', context)


@login_required
@require_administrador_capacitaciones
def editar_perfil(request, perfil_id):
    """
    Vista para editar un perfil específico
    """
    perfil = get_object_or_404(PerfilUsuario, id=perfil_id)
    
    if request.method == 'POST':
        rol = request.POST.get('rol')
        activo = request.POST.get('activo') == 'on'
        notas = request.POST.get('notas', '')
        
        # Validar rol
        roles_validos = [r[0] for r in PerfilUsuario.ROL_CHOICES]
        if rol not in roles_validos:
            messages.error(request, 'Rol inválido')
            return redirect('editar_perfil', perfil_id=perfil_id)
        
        # Actualizar perfil
        rol_anterior = perfil.rol_capacitaciones
        perfil.rol_capacitaciones = rol
        perfil.activo = activo
        perfil.notas = notas
        
        # Si cambió el rol, actualizar fecha
        if rol_anterior != rol:
            perfil.fecha_asignacion_rol = timezone.now()
            if not notas:
                perfil.notas = f"Rol cambiado de {rol_anterior} a {rol} por {request.user.username}"
        
        perfil.save()
        
        messages.success(request, f'Perfil de {perfil.user.username} actualizado correctamente')
        return redirect('gestionar_perfiles')
    
    # Obtener grupos si es supervisor
    grupos_supervisados = []
    if perfil.rol_capacitaciones == 'supervisor':
        grupos_supervisados = GrupoAsignacion.objects.filter(
            Q(supervisor_principal=perfil.user) |
            Q(supervisores_adicionales=perfil.user)
        ).distinct()
    
    # Obtener cursos asignados
    cursos_asignados = perfil.user.cursos_asignados.all()[:5]
    
    context = {
        'perfil': perfil,
        'roles': PerfilUsuario.ROL_CHOICES,
        'grupos_supervisados': grupos_supervisados,
        'cursos_asignados': cursos_asignados,
    }
    
    return render(request, 'capacitaciones_app/editar_perfil.html', context)


@login_required
@require_administrador_capacitaciones
@require_POST
def cambiar_rol_ajax(request):
    """
    Cambia el rol de un usuario vía AJAX
    """
    try:
        data = json.loads(request.body)
        perfil_id = data.get('perfil_id')
        nuevo_rol = data.get('rol')
        
        # Validar
        if not perfil_id or not nuevo_rol:
            return JsonResponse({
                'success': False,
                'error': 'Datos incompletos'
            })
        
        roles_validos = [r[0] for r in PerfilUsuario.ROL_CHOICES]
        if nuevo_rol not in roles_validos:
            return JsonResponse({
                'success': False,
                'error': 'Rol inválido'
            })
        
        # Actualizar
        perfil = PerfilUsuario.objects.get(id=perfil_id)
        rol_anterior = perfil.rol_capacitaciones
        perfil.rol_capacitaciones = nuevo_rol
        perfil.fecha_asignacion_rol = timezone.now()
        perfil.notas = f"Rol cambiado de {rol_anterior} a {nuevo_rol} por {request.user.username} - {timezone.now().strftime('%Y-%m-%d %H:%M')}"
        perfil.save()
        
        return JsonResponse({
            'success': True,
            'mensaje': f'Rol de {perfil.user.username} actualizado a {perfil.get_rol_capacitaciones_display()}'
        })
        
    except PerfilUsuario.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Perfil no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def toggle_activo_ajax(request):
    """
    Activa/desactiva un perfil vía AJAX
    """
    try:
        data = json.loads(request.body)
        perfil_id = data.get('perfil_id')
        
        if not perfil_id:
            return JsonResponse({
                'success': False,
                'error': 'ID de perfil requerido'
            })
        
        perfil = PerfilUsuario.objects.get(id=perfil_id)
        perfil.activo = not perfil.activo
        perfil.save()
        
        estado = 'activado' if perfil.activo else 'desactivado'
        
        return JsonResponse({
            'success': True,
            'activo': perfil.activo,
            'mensaje': f'Perfil de {perfil.user.username} {estado}'
        })
        
    except PerfilUsuario.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Perfil no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def crear_perfiles_faltantes(request):
    """
    Crea perfiles para usuarios que no tienen uno
    """
    try:
        # Usuarios sin perfil
        usuarios_sin_perfil = User.objects.filter(
            is_active=True
        ).exclude(
            perfil__isnull=False
        )
        
        count = 0
        for user in usuarios_sin_perfil:
            # Determinar rol por defecto
            if user.is_superuser:
                rol = 'administrador'
            elif hasattr(user, 'userprofile') and user.userprofile.rol == 'Administrador':
                rol = 'administrador'
            elif hasattr(user, 'userprofile') and user.userprofile.rol == 'Supervisor':
                rol = 'supervisor'
            else:
                rol = 'estudiante'
            
            PerfilUsuario.objects.create(
                user=user,
                rol_capacitaciones=rol,
                activo=True,
                notas=f"Perfil creado automáticamente por {request.user.username}"
            )
            count += 1
        
        messages.success(request, f'Se crearon {count} perfiles nuevos')
        return redirect('gestionar_perfiles')
        
    except Exception as e:
        messages.error(request, f'Error al crear perfiles: {str(e)}')
        return redirect('gestionar_perfiles')


@login_required
@require_administrador_capacitaciones
@require_POST
def asignar_usuario_grupo_ajax(request):
    """
    Asigna un usuario a un grupo vía AJAX
    """
    try:
        data = json.loads(request.body)
        usuario_id = data.get('usuario_id')
        grupo_id = data.get('grupo_id')
        
        if not usuario_id or not grupo_id:
            return JsonResponse({
                'success': False,
                'error': 'Datos incompletos'
            })
        
        usuario = User.objects.get(id=usuario_id)
        grupo = GrupoAsignacion.objects.get(id=grupo_id)
        
        # Agregar usuario al grupo
        if not grupo.usuarios_asignados.filter(id=usuario.id).exists():
            grupo.usuarios_asignados.add(usuario)
            return JsonResponse({
                'success': True,
                'mensaje': f'{usuario.username} agregado a {grupo.nombre}'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': 'El usuario ya está en el grupo'
            })
        
    except (User.DoesNotExist, GrupoAsignacion.DoesNotExist):
        return JsonResponse({
            'success': False,
            'error': 'Usuario o grupo no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def remover_usuario_grupo_ajax(request):
    """
    Remueve un usuario de un grupo vía AJAX
    """
    try:
        data = json.loads(request.body)
        usuario_id = data.get('usuario_id')
        grupo_id = data.get('grupo_id')
        
        if not usuario_id or not grupo_id:
            return JsonResponse({
                'success': False,
                'error': 'Datos incompletos'
            })
        
        usuario = User.objects.get(id=usuario_id)
        grupo = GrupoAsignacion.objects.get(id=grupo_id)
        
        # Remover usuario del grupo
        if grupo.usuarios_asignados.filter(id=usuario.id).exists():
            grupo.usuarios_asignados.remove(usuario)
            return JsonResponse({
                'success': True,
                'mensaje': f'{usuario.username} removido de {grupo.nombre}'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': 'El usuario no está en el grupo'
            })
        
    except (User.DoesNotExist, GrupoAsignacion.DoesNotExist):
        return JsonResponse({
            'success': False,
            'error': 'Usuario o grupo no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def crear_grupo_ajax(request):
    """
    Crea un nuevo grupo de asignación vía AJAX
    """
    try:
        data = json.loads(request.body)
        nombre = data.get('nombre', '').strip()
        supervisor_principal_id = data.get('supervisor_principal')
        supervisores_adicionales_ids = data.get('supervisores_adicionales', [])
        miembros_iniciales_ids = data.get('miembros_iniciales', [])
        
        # Validation
        if not nombre:
            return JsonResponse({
                'success': False,
                'error': 'El nombre del grupo es requerido'
            })
        
        # Check if group name already exists
        if GrupoAsignacion.objects.filter(nombre__iexact=nombre).exists():
            return JsonResponse({
                'success': False,
                'error': 'Ya existe un grupo con ese nombre'
            })
        
        # Create the group
        grupo = GrupoAsignacion.objects.create(nombre=nombre)
        
        # Set supervisor principal if provided
        if supervisor_principal_id:
            try:
                supervisor_principal = User.objects.get(id=supervisor_principal_id)
                # Verify the user is a supervisor
                if hasattr(supervisor_principal, 'perfil') and supervisor_principal.perfil.rol_capacitaciones == 'supervisor':
                    grupo.supervisor_principal = supervisor_principal
                    grupo.save()
                else:
                    return JsonResponse({
                        'success': False,
                        'error': 'El usuario seleccionado no es un supervisor válido'
                    })
            except User.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Supervisor principal no encontrado'
                })
        
        # Add additional supervisors
        if supervisores_adicionales_ids:
            try:
                supervisores_adicionales = User.objects.filter(id__in=supervisores_adicionales_ids)
                # Verify all users are supervisors
                for supervisor in supervisores_adicionales:
                    if not (hasattr(supervisor, 'perfil') and supervisor.perfil.rol_capacitaciones == 'supervisor'):
                        return JsonResponse({
                            'success': False,
                            'error': f'El usuario {supervisor.username} no es un supervisor válido'
                        })
                
                grupo.supervisores_adicionales.set(supervisores_adicionales)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Error al asignar supervisores adicionales: {str(e)}'
                })
        
        # Add initial members
        if miembros_iniciales_ids:
            try:
                miembros_iniciales = User.objects.filter(id__in=miembros_iniciales_ids)
                grupo.usuarios_asignados.set(miembros_iniciales)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Error al asignar miembros iniciales: {str(e)}'
                })
        
        return JsonResponse({
            'success': True,
            'mensaje': f'Grupo "{nombre}" creado exitosamente',
            'grupo_id': grupo.id
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Datos JSON inválidos'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error inesperado: {str(e)}'
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def editar_grupo_ajax(request):
    """
    Edita un grupo de asignación existente vía AJAX
    """
    try:
        data = json.loads(request.body)
        grupo_id = data.get('grupo_id')
        nombre = data.get('nombre', '').strip()
        supervisor_principal_id = data.get('supervisor_principal')
        supervisores_adicionales_ids = data.get('supervisores_adicionales', [])
        
        # Validation
        if not grupo_id:
            return JsonResponse({
                'success': False,
                'error': 'ID del grupo es requerido'
            })
        
        if not nombre:
            return JsonResponse({
                'success': False,
                'error': 'El nombre del grupo es requerido'
            })
        
        # Get the group
        try:
            grupo = GrupoAsignacion.objects.get(id=grupo_id)
        except GrupoAsignacion.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Grupo no encontrado'
            })
        
        # Check if group name already exists (excluding current group)
        if GrupoAsignacion.objects.filter(nombre__iexact=nombre).exclude(id=grupo_id).exists():
            return JsonResponse({
                'success': False,
                'error': 'Ya existe otro grupo con ese nombre'
            })
        
        # Update group name
        grupo.nombre = nombre
        
        # Update supervisor principal
        if supervisor_principal_id:
            try:
                supervisor_principal = User.objects.get(id=supervisor_principal_id)
                # Verify the user is a supervisor
                if hasattr(supervisor_principal, 'perfil') and supervisor_principal.perfil.rol_capacitaciones == 'supervisor':
                    grupo.supervisor_principal = supervisor_principal
                else:
                    return JsonResponse({
                        'success': False,
                        'error': 'El usuario seleccionado no es un supervisor válido'
                    })
            except User.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Supervisor principal no encontrado'
                })
        else:
            # Remove supervisor principal if none selected
            grupo.supervisor_principal = None
        
        # Update additional supervisors
        if supervisores_adicionales_ids:
            try:
                supervisores_adicionales = User.objects.filter(id__in=supervisores_adicionales_ids)
                # Verify all users are supervisors
                for supervisor in supervisores_adicionales:
                    if not (hasattr(supervisor, 'perfil') and supervisor.perfil.rol_capacitaciones == 'supervisor'):
                        return JsonResponse({
                            'success': False,
                            'error': f'El usuario {supervisor.username} no es un supervisor válido'
                        })
                
                grupo.supervisores_adicionales.set(supervisores_adicionales)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Error al actualizar supervisores adicionales: {str(e)}'
                })
        else:
            # Clear additional supervisors if none selected
            grupo.supervisores_adicionales.clear()
        
        # Save the group
        grupo.save()
        
        return JsonResponse({
            'success': True,
            'mensaje': f'Grupo "{nombre}" actualizado exitosamente',
            'grupo_id': grupo.id
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Datos JSON inválidos'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error inesperado: {str(e)}'
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def editar_usuario_ajax(request):
    """
    Edita un usuario y su perfil vía AJAX
    """
    try:
        data = json.loads(request.body)
        perfil_id = data.get('perfil_id')
        email = data.get('email', '').strip()
        nombre_completo = data.get('nombre_completo', '').strip()
        rol = data.get('rol')
        activo = data.get('activo', True)
        notas = data.get('notas', '').strip()
        grupos_ids = data.get('grupos_ids', [])
        
        # Validation
        if not perfil_id:
            return JsonResponse({
                'success': False,
                'error': 'ID del perfil es requerido'
            })
        
        # Get the profile
        try:
            perfil = PerfilUsuario.objects.get(id=perfil_id)
        except PerfilUsuario.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Perfil no encontrado'
            })
        
        # Validate role
        if rol and rol not in ['administrador', 'supervisor', 'estudiante']:
            return JsonResponse({
                'success': False,
                'error': 'Rol inválido'
            })
        
        # Update user fields
        user = perfil.user
        if email:
            user.email = email
        if nombre_completo:
            # Split name into first and last name
            name_parts = nombre_completo.split(' ', 1)
            user.first_name = name_parts[0]
            user.last_name = name_parts[1] if len(name_parts) > 1 else ''
        user.save()
        
        # Update profile fields
        if rol:
            perfil.rol_capacitaciones = rol
        perfil.activo = activo
        perfil.notas = notas
        perfil.save()
        
        # Update group assignments
        if grupos_ids is not None:  # Allow empty list to clear all groups
            try:
                # Convert string IDs to integers
                grupos_ids = [int(gid) for gid in grupos_ids]
                # Get the groups
                grupos = GrupoAsignacion.objects.filter(id__in=grupos_ids)
                # Clear current groups and set new ones
                user.grupos_asignados.set(grupos)
            except ValueError:
                return JsonResponse({
                    'success': False,
                    'error': 'IDs de grupos inválidos'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Error al actualizar grupos: {str(e)}'
                })
        
        return JsonResponse({
            'success': True,
            'mensaje': f'Usuario {user.username} actualizado exitosamente'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Datos JSON inválidos'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error inesperado: {str(e)}'
        })


@login_required
@require_administrador_capacitaciones
@require_POST
def sincronizar_desde_pacifico(request):
    """
    Sincroniza roles desde pacifico.UserProfile
    """
    try:
        from pacifico.models import UserProfile
        
        role_mapping = {
            'Administrador': 'administrador',
            'Supervisor': 'supervisor',
            'Oficial': 'estudiante',
            'Asistente': 'estudiante',
            'Analista': 'estudiante',
            'Back Office': 'estudiante',
            'Usuario': 'estudiante',
        }
        
        updated = 0
        for perfil in PerfilUsuario.objects.all():
            try:
                if hasattr(perfil.user, 'userprofile'):
                    pacifico_rol = perfil.user.userprofile.rol
                    nuevo_rol = role_mapping.get(pacifico_rol, 'estudiante')
                    
                    if perfil.rol_capacitaciones != nuevo_rol:
                        perfil.rol_capacitaciones = nuevo_rol
                        perfil.fecha_asignacion_rol = timezone.now()
                        perfil.notas = f"Sincronizado desde pacifico ({pacifico_rol}) por {request.user.username} - {timezone.now().strftime('%Y-%m-%d %H:%M')}"
                        perfil.save()
                        updated += 1
            except Exception:
                continue
        
        messages.success(request, f'Se sincronizaron {updated} perfiles desde pacifico')
        return redirect('gestionar_perfiles')
        
    except ImportError:
        messages.error(request, 'No se pudo importar pacifico.UserProfile')
        return redirect('gestionar_perfiles')
    except Exception as e:
        messages.error(request, f'Error al sincronizar: {str(e)}')
        return redirect('gestionar_perfiles')

