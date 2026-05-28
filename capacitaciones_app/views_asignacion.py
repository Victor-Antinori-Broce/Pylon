from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from django.views.decorators.http import require_POST, require_GET
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.utils.timezone import localtime
from django.db import models
import json
import pandas as pd

from .models import (
    Curso, GrupoAsignacion, Asignacion, ProgresoCurso, ProgresoTema, ResultadoQuiz, Quiz, PerfilUsuario
)
from .permissions import (
    es_administrador_capacitaciones,
    es_supervisor_capacitaciones,
    puede_asignar_cursos,
    puede_ver_reportes,
    require_administrador_capacitaciones,
    require_puede_asignar_cursos,
    require_puede_ver_reportes,
    obtener_grupos_supervisados,
    obtener_usuarios_supervisados
)


def calcular_progreso_real(usuario, curso):
    total_temas = sum(mod.temas.count() for mod in curso.modulos.all())
    temas_completados = ProgresoTema.objects.filter(
        usuario=usuario, tema__modulo__curso=curso, completado=True
    ).count()

    total_quizzes = Quiz.objects.filter(modulo__curso=curso).count()
    quizzes_aprobados = ResultadoQuiz.objects.filter(
        usuario=usuario, quiz__modulo__curso=curso, aprobado=True
    ).count()

    total_elementos = total_temas + total_quizzes
    total_completados = temas_completados + quizzes_aprobados
    progreso = round((total_completados / total_elementos) * 100) if total_elementos > 0 else 0

    return progreso, f"{total_completados}/{total_elementos}"


@login_required
@require_puede_asignar_cursos
def asignacion_admin(request):
    if request.method == 'POST':
        cursos_ids = request.POST.getlist('cursos')
        usuarios_ids = request.POST.getlist('usuarios')
        grupos_ids = request.POST.getlist('grupos')

        cursos = Curso.objects.filter(id__in=cursos_ids)
        usuarios = User.objects.filter(id__in=usuarios_ids)
        grupos = GrupoAsignacion.objects.filter(id__in=grupos_ids)

        for curso in cursos:
            for usuario in usuarios:
                if not curso.usuarios_asignados.filter(id=usuario.id).exists():
                    curso.usuarios_asignados.add(usuario)
                    Asignacion.objects.create(curso=curso, usuario=usuario, metodo='admin')

            for grupo in grupos:
                curso.grupos_asignados.add(grupo)
                for usuario in grupo.usuarios_asignados.all():
                    if not curso.usuarios_asignados.filter(id=usuario.id).exists():
                        curso.usuarios_asignados.add(usuario)
                        Asignacion.objects.create(curso=curso, usuario=usuario, grupo=grupo, metodo='admin')

        return redirect('asignacion_admin')

    cursos = Curso.objects.all()
    usuarios = User.objects.filter(is_active=True)
    grupos = GrupoAsignacion.objects.all()

    historial = []
    asignaciones = Asignacion.objects.select_related('curso', 'usuario', 'grupo').order_by('-fecha')

    for a in asignaciones:
        # ✅ Mostrar solo si aún está asignado
        if not a.usuario or not a.curso.usuarios_asignados.filter(id=a.usuario.id).exists():
            continue

        progreso = None
        completados = 0
        total_modulos = a.curso.modulos.count()
        fecha_final = None

        progreso_obj = ProgresoCurso.objects.filter(usuario=a.usuario, curso=a.curso).first()
        if progreso_obj:
            completados = progreso_obj.modulos_completados.count()
            progreso = round((completados / total_modulos) * 100) if total_modulos > 0 else 0
            fecha_final = progreso_obj.fecha_completado

        historial.append({
            'asignacion': a,
            'progreso': progreso,
            'completados': completados,
            'total': total_modulos,
            'completado_en': fecha_final,
        })

    return render(request, 'capacitaciones_app/asignacion_admin.html', {
        'cursos': cursos,
        'usuarios': usuarios,
        'grupos': grupos,
        'historial': historial,
    })


@require_POST
@require_puede_asignar_cursos
def asignar_curso_ajax(request):
    try:
        data = json.loads(request.body)
        curso_id = data.get('curso_id')
        usuario_id = data.get('usuario_id')
        grupo_id = data.get('grupo_id')

        curso = Curso.objects.get(id=curso_id)

        if usuario_id:
            usuario = User.objects.get(id=usuario_id)
            if not curso.usuarios_asignados.filter(id=usuario.id).exists():
                curso.usuarios_asignados.add(usuario)
                Asignacion.objects.create(curso=curso, usuario=usuario, metodo='dragdrop')
            mensaje = f'✅ Curso "{curso.titulo}" asignado a {usuario.username}.'
            return JsonResponse({'success': True, 'mensaje': mensaje})

        elif grupo_id:
            grupo = GrupoAsignacion.objects.get(id=grupo_id)
            curso.grupos_asignados.add(grupo)
            for usuario in grupo.usuarios_asignados.all():
                if not curso.usuarios_asignados.filter(id=usuario.id).exists():
                    curso.usuarios_asignados.add(usuario)
                    Asignacion.objects.create(curso=curso, usuario=usuario, grupo=grupo, metodo='dragdrop')
            mensaje = f'✅ Curso "{curso.titulo}" asignado al grupo "{grupo.nombre}".'
            return JsonResponse({'success': True, 'mensaje': mensaje})

        return JsonResponse({'success': False, 'mensaje': 'No se especificó usuario ni grupo.'})

    except Exception as e:
        return JsonResponse({'success': False, 'mensaje': str(e)})


@require_POST
@require_puede_asignar_cursos
def desasignar_curso_ajax(request):
    try:
        data = json.loads(request.body)
        curso_id = data.get('curso_id')
        usuario_id = data.get('usuario_id')

        curso = Curso.objects.get(id=curso_id)
        user = User.objects.get(id=usuario_id)

        curso.usuarios_asignados.remove(user)
        return JsonResponse({'success': True, 'mensaje': 'Curso desasignado correctamente'})

    except Exception as e:
        return JsonResponse({'success': False, 'mensaje': str(e)})


@require_puede_ver_reportes
def cursos_asignados_ajax(request, usuario_id):
    cursos = Curso.objects.filter(usuarios_asignados__id=usuario_id)
    data = list(cursos.values('id', 'titulo'))
    return JsonResponse({'cursos': data})


@login_required
@require_puede_ver_reportes
def miembros_grupo_ajax(request, grupo_id):
    """Vista para obtener los miembros de un grupo específico"""
    try:
        grupo = GrupoAsignacion.objects.get(id=grupo_id)
        miembros = grupo.usuarios_asignados.all()
        
        data = []
        for usuario in miembros:
            # Contar cursos asignados al usuario
            cursos_count = usuario.cursos_asignados.count()
            
            data.append({
                'id': usuario.id,
                'username': usuario.username,
                'first_name': usuario.first_name or '',
                'last_name': usuario.last_name or '',
                'email': usuario.email or '',
                'is_active': usuario.is_active,
                'is_staff': usuario.is_staff,
                'cursos_count': cursos_count,
                'date_joined': usuario.date_joined.strftime('%d/%m/%Y') if usuario.date_joined else '',
            })
        
        return JsonResponse({
            'success': True,
            'grupo_nombre': grupo.nombre,
            'miembros': data
        })
    except GrupoAsignacion.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Grupo no encontrado'
        })


@login_required
@require_puede_ver_reportes
def exportar_asignaciones_excel(request):
    # Filtrar asignaciones según el rol del usuario
    if es_supervisor_capacitaciones(request.user):
        # Los supervisores solo exportan asignaciones de usuarios en sus grupos supervisados
        usuarios_supervisados = obtener_usuarios_supervisados(request.user)
        asignaciones = Asignacion.objects.filter(
            usuario__in=usuarios_supervisados
        ).select_related('curso', 'usuario', 'grupo').order_by('-fecha')
    else:
        # Los administradores exportan todas las asignaciones
        asignaciones = Asignacion.objects.select_related('curso', 'usuario', 'grupo').order_by('-fecha')

    data = []
    for a in asignaciones:
        # ✅ Exportar solo cursos actualmente asignados
        if not a.usuario or not a.curso.usuarios_asignados.filter(id=a.usuario.id).exists():
            continue

        # Obtener el nombre completo del usuario
        nombre_completo = f"{a.usuario.first_name} {a.usuario.last_name}".strip()
        if not nombre_completo:
            nombre_completo = a.usuario.username

        # Obtener número de colaborador
        numero_colaborador = None
        if hasattr(a.usuario, 'userprofile') and a.usuario.userprofile.numeroColaborador:
            numero_colaborador = a.usuario.userprofile.numeroColaborador

        # Tipo de curso y duración
        tipo_curso = a.curso.get_tipo_curso_display() if a.curso and a.curso.tipo_curso else ''
        duracion_horas = a.curso.duracion_horas if a.curso and a.curso.duracion_horas else ''

        # Progreso y fecha de finalización
        progreso_obj = ProgresoCurso.objects.filter(usuario=a.usuario, curso=a.curso).first()
        progreso = None
        fecha_final = None
        if progreso_obj:
            total_modulos = a.curso.modulos.count()
            completados = progreso_obj.modulos_completados.count()
            progreso = round((completados / total_modulos) * 100) if total_modulos > 0 else 0
            fecha_final = progreso_obj.fecha_completado.strftime('%Y-%m-%d %H:%M') if progreso_obj.fecha_completado else ''

        data.append({
            'Fecha asignación': a.fecha.strftime('%Y-%m-%d %H:%M'),
            'Curso': a.curso.titulo,
            'Tipo de curso': tipo_curso,
            'Duración (horas)': duracion_horas,
            'Usuario': nombre_completo,
            'Número de colaborador': numero_colaborador,
            'Grupo': a.grupo.nombre if a.grupo else '',
            'Método': a.metodo,
            'Progreso (%)': progreso if progreso is not None else '',
            'Fecha finalización': fecha_final if fecha_final else '',
        })

    df = pd.DataFrame(data)
    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="asignaciones.xlsx"'
    df.to_excel(response, index=False)
    return response


@login_required
@require_puede_ver_reportes
def historial_asignaciones_ajax(request):
    historial = []

    # 🔎 Agrupamos por usuario + curso (evitamos duplicados)
    registros_vistos = set()

    # Filtrar asignaciones según el rol del usuario
    if es_supervisor_capacitaciones(request.user):
        # Los supervisores solo ven asignaciones de usuarios en sus grupos supervisados
        usuarios_supervisados = obtener_usuarios_supervisados(request.user)
        asignaciones = Asignacion.objects.filter(
            usuario__in=usuarios_supervisados
        ).select_related('curso', 'usuario', 'grupo').order_by('-fecha')
    else:
        # Los administradores ven todas las asignaciones
        asignaciones = Asignacion.objects.select_related('curso', 'usuario', 'grupo').order_by('-fecha')

    for a in asignaciones:
        usuario = a.usuario
        curso = a.curso

        if not usuario or not curso:
            continue

        # ⚠️ Evitar duplicados: si ya se vio esta combinación, skip
        key = (usuario.id, curso.id)
        if key in registros_vistos:
            continue
        registros_vistos.add(key)

        # ✅ Solo incluir si el curso sigue asignado al usuario (lógica original)
        if not curso.usuarios_asignados.filter(id=usuario.id).exists():
            continue

        progreso_obj = ProgresoCurso.objects.filter(usuario=usuario, curso=curso).first()
        progreso, modulos_texto = calcular_progreso_real(usuario, curso)

        # Obtener el nombre completo del usuario
        nombre_completo = f"{usuario.first_name} {usuario.last_name}".strip()
        if not nombre_completo:
            nombre_completo = usuario.username
        
        # Obtener el grupo al que pertenece el usuario
        grupo_usuario = None
        grupos_usuario = usuario.grupos_asignados.all()
        if grupos_usuario.exists():
            grupo_usuario = grupos_usuario.first().nombre
        
        historial.append({
            'fecha': localtime(a.fecha).strftime('%d/%m/%Y %H:%M'),
            'curso': curso.titulo,
            'usuario': nombre_completo,
            'grupo': grupo_usuario if grupo_usuario else '—',
            'progreso': f"{progreso}%",
            'modulos': modulos_texto,
            'finalizado': localtime(progreso_obj.fecha_completado).strftime('%d/%m/%Y') if progreso_obj and progreso_obj.completado else '—',
            'ultimo_ingreso': localtime(usuario.last_login).strftime('%d/%m/%Y %H:%M') if usuario.last_login else '—',
        })

    return JsonResponse({'historial': historial})


@login_required
@require_puede_ver_reportes
def historial_asignaciones_view(request):
    """Vista independiente para mostrar el historial de asignaciones"""
    
    # Obtener datos para filtros según el rol del usuario
    if es_supervisor_capacitaciones(request.user):
        # Los supervisores solo ven cursos y usuarios de sus grupos supervisados
        grupos_supervisados = obtener_grupos_supervisados(request.user)
        usuarios_supervisados = obtener_usuarios_supervisados(request.user)
        cursos = Curso.objects.filter(usuarios_asignados__in=usuarios_supervisados).distinct()
        usuarios = usuarios_supervisados
        grupos = grupos_supervisados
        asignaciones = Asignacion.objects.filter(
            usuario__in=usuarios_supervisados
        ).select_related('curso', 'usuario', 'grupo').order_by('-fecha')
    else:
        # Los administradores ven todos los datos
        cursos = Curso.objects.all()
        usuarios = User.objects.filter(is_active=True)
        grupos = GrupoAsignacion.objects.all()
        asignaciones = Asignacion.objects.select_related('curso', 'usuario', 'grupo').order_by('-fecha')

    historial = []

    for a in asignaciones:
        # ✅ Mostrar solo si aún está asignado (mantener la lógica original)
        if not a.usuario or not a.curso.usuarios_asignados.filter(id=a.usuario.id).exists():
            continue

        progreso = None
        completados = 0
        total_modulos = a.curso.modulos.count()
        fecha_final = None

        progreso_obj = ProgresoCurso.objects.filter(usuario=a.usuario, curso=a.curso).first()
        if progreso_obj:
            completados = progreso_obj.modulos_completados.count()
            progreso = round((completados / total_modulos) * 100) if total_modulos > 0 else 0
            fecha_final = progreso_obj.fecha_completado

        historial.append({
            'asignacion': a,
            'progreso': progreso,
            'completados': completados,
            'total': total_modulos,
            'completado_en': fecha_final,
        })

    return render(request, 'capacitaciones_app/historial_asignaciones.html', {
        'cursos': cursos,
        'usuarios': usuarios,
        'grupos': grupos,
        'historial': historial,
    })

from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from capacitaciones_app.models import (
    Asignacion,
    ProgresoCurso,
    ProgresoTema,
)

@login_required
def historial_usuario(request):
    usuario = request.user

    # 🔁 Obtener asignaciones y filtrar duplicados
    asignaciones_qs = Asignacion.objects.filter(usuario=usuario).select_related('curso').order_by('-fecha')

    cursos_vistos = set()
    asignaciones = []

    for a in asignaciones_qs:
        if a.curso_id in cursos_vistos:
            continue

        cursos_vistos.add(a.curso_id)

        # ✅ Verificar si hay progreso
        temas_completados = ProgresoTema.objects.filter(
            usuario=usuario,
            tema__modulo__curso=a.curso,
            completado=True
        ).count()

        # ✅ Mostrar solo si tiene progreso o sigue asignado
        if temas_completados > 0 or a.curso.usuarios_asignados.filter(id=usuario.id).exists():
            asignaciones.append(a)

    # 📊 Preparar progreso detallado (usando la misma lógica que detalle_curso)
    progreso_qs = ProgresoCurso.objects.filter(usuario=usuario).select_related('curso')
    progreso_dict = {}

    for p in progreso_qs:
        # Calcular igual que en detalle_curso
        temas_completados_count = ProgresoTema.objects.filter(
            usuario=usuario,
            tema__modulo__curso=p.curso,
            completado=True
        ).count()

        quizzes_aprobados_count = ResultadoQuiz.objects.filter(
            usuario=usuario,
            quiz__modulo__curso=p.curso,
            aprobado=True
        ).count()
        
        total_temas = sum(mod.temas.count() for mod in p.curso.modulos.all())
        total_quizzes = Quiz.objects.filter(modulo__curso=p.curso).count()
        encuesta_completada = p.encuesta_completada
        
        total_elementos = total_temas + total_quizzes + 1  # Se suma 1 por la encuesta
        total_completados = temas_completados_count + quizzes_aprobados_count + (1 if encuesta_completada else 0)

        porcentaje = round((total_completados / total_elementos) * 100) if total_elementos > 0 else 0
        porcentaje = min(porcentaje, 100)
        
        p.porcentaje = porcentaje
        progreso_dict[p.curso.id] = p

    return render(request, 'capacitaciones_app/mi_historial.html', {
        'asignaciones': asignaciones,
        'progreso': progreso_dict,
    })


@login_required
@require_puede_asignar_cursos
def usuarios_disponibles_grupo(request, grupo_id):
    """
    Devuelve los usuarios que NO están en el grupo especificado
    """
    try:
        grupo = GrupoAsignacion.objects.get(id=grupo_id)
        
        # Obtener usuarios que NO están en el grupo y que están activos
        usuarios_en_grupo = grupo.usuarios_asignados.all()
        usuarios_disponibles = User.objects.filter(is_active=True).exclude(id__in=usuarios_en_grupo).order_by('username')
        
        usuarios_data = []
        for usuario in usuarios_disponibles:
            usuarios_data.append({
                'id': usuario.id,
                'username': usuario.username,
                'first_name': usuario.first_name,
                'last_name': usuario.last_name,
                'email': usuario.email,
                'is_active': usuario.is_active,
                'is_staff': usuario.is_staff,
            })
        
        return JsonResponse({
            'success': True,
            'usuarios': usuarios_data
        })
        
    except GrupoAsignacion.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Grupo no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@require_POST
@login_required
@require_puede_asignar_cursos
def agregar_miembros_grupo(request):
    """
    Agrega usuarios a un grupo
    """
    try:
        data = json.loads(request.body)
        grupo_id = data.get('grupo_id')
        usuarios_ids = data.get('usuarios_ids', [])
        
        if not grupo_id or not usuarios_ids:
            return JsonResponse({
                'success': False,
                'error': 'Faltan datos requeridos'
            })
        
        grupo = GrupoAsignacion.objects.get(id=grupo_id)
        usuarios = User.objects.filter(id__in=usuarios_ids)
        
        # Agregar usuarios al grupo
        agregados = 0
        for usuario in usuarios:
            if not grupo.usuarios_asignados.filter(id=usuario.id).exists():
                grupo.usuarios_asignados.add(usuario)
                agregados += 1
        
        return JsonResponse({
            'success': True,
            'agregados': agregados,
            'total_seleccionados': len(usuarios_ids)
        })
        
    except GrupoAsignacion.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Grupo no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@require_POST
@login_required
@require_puede_asignar_cursos
def remover_miembro_grupo(request):
    """
    Remueve un usuario de un grupo
    """
    try:
        data = json.loads(request.body)
        grupo_id = data.get('grupo_id')
        usuario_id = data.get('usuario_id')
        
        if not grupo_id or not usuario_id:
            return JsonResponse({
                'success': False,
                'error': 'Faltan datos requeridos'
            })
        
        grupo = GrupoAsignacion.objects.get(id=grupo_id)
        usuario = User.objects.get(id=usuario_id)
        
        if grupo.usuarios_asignados.filter(id=usuario.id).exists():
            grupo.usuarios_asignados.remove(usuario)
            return JsonResponse({
                'success': True,
                'mensaje': f'Usuario {usuario.username} removido del grupo'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': 'El usuario no está en el grupo'
            })
        
    except (GrupoAsignacion.DoesNotExist, User.DoesNotExist):
        return JsonResponse({
            'success': False,
            'error': 'Grupo o usuario no encontrado'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })


@login_required
@require_puede_ver_reportes
def usuario_cursos_asignados(request, usuario_id):
    """
    Devuelve todos los cursos asignados a un usuario con información de progreso
    """
    try:
        usuario = User.objects.get(id=usuario_id)
        
        # Verificar permisos: solo administradores o supervisores pueden ver esto
        if not (es_administrador_capacitaciones(request.user) or es_supervisor_capacitaciones(request.user)):
            return JsonResponse({
                'success': False,
                'error': 'No tienes permisos para ver esta información'
            }, status=403)
        
        # Si es supervisor, verificar que el usuario esté en sus grupos supervisados
        if es_supervisor_capacitaciones(request.user) and not es_administrador_capacitaciones(request.user):
            usuarios_supervisados = obtener_usuarios_supervisados(request.user)
            if usuario not in usuarios_supervisados:
                return JsonResponse({
                    'success': False,
                    'error': 'No tienes permisos para ver los cursos de este usuario'
                }, status=403)
        
        # Obtener cursos asignados
        cursos_asignados = Curso.objects.filter(usuarios_asignados=usuario).order_by('-id')
        
        cursos_data = []
        for curso in cursos_asignados:
            # Calcular progreso real
            progreso, modulos_texto = calcular_progreso_real(usuario, curso)
            
            # Obtener información de progreso
            progreso_obj = ProgresoCurso.objects.filter(usuario=usuario, curso=curso).first()
            completado = progreso_obj.completado if progreso_obj else False
            
            # Obtener fecha de asignación
            asignacion = Asignacion.objects.filter(usuario=usuario, curso=curso).order_by('-fecha').first()
            fecha_asignacion = asignacion.fecha.strftime('%d/%m/%Y %H:%M') if asignacion else None
            
            cursos_data.append({
                'id': curso.id,
                'titulo': curso.titulo,
                'tipo_curso': curso.tipo_curso,
                'tipo_curso_display': curso.get_tipo_curso_display() if curso.tipo_curso else '',
                'duracion_horas': curso.duracion_horas,
                'progreso': progreso,
                'completado': completado,
                'fecha_asignacion': fecha_asignacion,
                'modulos_texto': modulos_texto
            })
        
        return JsonResponse({
            'success': True,
            'cursos': cursos_data,
            'usuario': {
                'id': usuario.id,
                'username': usuario.username,
                'nombre_completo': f"{usuario.first_name} {usuario.last_name}".strip() or usuario.username
            }
        })
        
    except User.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Usuario no encontrado'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@login_required
@require_puede_asignar_cursos
def cursos_disponibles(request):
    """
    Devuelve todos los cursos disponibles para asignar
    """
    try:
        # Obtener todos los cursos
        cursos = Curso.objects.all().order_by('titulo')
        
        cursos_data = []
        for curso in cursos:
            cursos_data.append({
                'id': curso.id,
                'titulo': curso.titulo,
                'tipo_curso': curso.tipo_curso,
                'tipo_curso_display': curso.get_tipo_curso_display() if curso.tipo_curso else '',
                'duracion_horas': curso.duracion_horas,
                'descripcion': curso.descripcion[:100] + '...' if curso.descripcion and len(curso.descripcion) > 100 else curso.descripcion,
                'total_modulos': curso.modulos.count()
            })
        
        return JsonResponse({
            'success': True,
            'cursos': cursos_data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)