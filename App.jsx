import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, 
  deleteDoc, doc 
} from 'firebase/firestore';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { 
  PlusCircle, MinusCircle, LayoutDashboard, ClipboardList, Package, 
  Bell, TrendingUp, Users, MapPin, Phone, Save, Trash2, 
  Download, CheckCircle, AlertCircle, Cloud, CloudOff, Loader2,
  History, Menu, X
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE (PROPORCIONADA POR EL ENTORNO) ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rehabilitafono-saas-v1';

// --- CONSTANTES DE NEGOCIO ---
const META_MENSUAL_OBJETIVO = 1500000;
const STOCK_INICIAL_LIBROS = 10;

const CATEGORIAS_INGRESO = [
  "Evaluación de Paciente", "Terapia Fonoaudiológica", "Lavado de Oídos", 
  "Operativo Auditivo", "Procedimiento Enfermería", "Libros", "Artículos para Rehabilitación"
];
const CATEGORIAS_GASTO = [
  "Combustible", "Tag", "Transporte Público", "Alimentación", 
  "Reinversión Materiales", "Reimpresión Libros", "Empaquetado", "Envío", "Marketing", "Otros"
];
const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta Débito/Crédito"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [msg, setMsg] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Filtros de tiempo
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [formData, setFormData] = useState({
    tipo: 'Ingreso',
    categoria: CATEGORIAS_INGRESO[0],
    monto: '',
    cantidad: 1,
    nombre: '',
    direccion: '',
    contacto: '',
    metodoPago: METODOS_PAGO[0],
    observacion: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  // Autenticación inicial
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Error Auth:", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Escucha de datos en tiempo real desde Firestore
  useEffect(() => {
    if (!user) return;
    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'registros');
    
    const unsubscribe = onSnapshot(recordsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setMsg({ type: 'error', text: 'Error al conectar con la nube' });
    });
    return () => unsubscribe();
  }, [user]);

  // --- LÓGICA DE DATOS ---
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const d = new Date(r.fecha);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [records, selectedMonth, selectedYear]);

  const stats = useMemo(() => {
    const ing = filteredRecords.filter(r => r.tipo === 'Ingreso').reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
    const egr = filteredRecords.filter(r => r.tipo === 'Egreso').reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
    const faltante = Math.max(0, META_MENSUAL_OBJETIVO - ing);
    const porcRestante = Math.max(0, 100 - (ing / META_MENSUAL_OBJETIVO) * 100);
    
    const vendidosTotal = records.filter(r => r.categoria === 'Libros').reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);
    
    return { 
      ing, egr, saldo: ing - egr, faltante, porcRestante, 
      librosStock: STOCK_INICIAL_LIBROS - vendidosTotal 
    };
  }, [filteredRecords, records]);

  const annualData = useMemo(() => {
    return MESES.map((mes, idx) => {
      const mesRecs = records.filter(r => {
        const d = new Date(r.fecha);
        return d.getMonth() === idx && d.getFullYear() === selectedYear;
      });
      const ing = mesRecs.filter(r => r.tipo === 'Ingreso').reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
      const egr = mesRecs.filter(r => r.tipo === 'Egreso').reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
      return { name: mes, ingresos: ing, egresos: egr };
    });
  }, [records, selectedYear]);

  // --- MANEJADORES ---
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (formData.categoria === 'Libros' && stats.librosStock < formData.cantidad) {
      setMsg({ type: 'error', text: 'Sin stock de libros' });
      return;
    }
    try {
      const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'registros');
      await addDoc(recordsRef, { ...formData, userId: user.uid, ts: Date.now() });
      setShowModal(false);
      setMsg({ type: 'success', text: 'Guardado en la nube' });
      setFormData(prev => ({ ...prev, monto: '', cantidad: 1, nombre: '', contacto: '', observacion: '' }));
    } catch (e) { setMsg({ type: 'error', text: 'Fallo al sincronizar' }); }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registros', id));
      setMsg({ type: 'info', text: 'Registro eliminado' });
    } catch (e) { setMsg({ type: 'error', text: 'Error al borrar' }); }
  };

  const exportCSV = () => {
    const head = "Fecha,Tipo,Categoria,Nombre,Monto,Metodo\n";
    const body = records.map(r => `${r.fecha},${r.tipo},${r.categoria},"${r.nombre}",${r.monto},${r.metodoPago}`).join("\n");
    const blob = new Blob([head + body], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `REHABILITAFONO_ANUAL_${selectedYear}.csv`;
    a.click();
  };

  if (loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-purple-900 text-white">
      <Loader2 className="animate-spin mb-4" size={48} />
      <p className="font-black text-xs uppercase tracking-[0.3em] animate-pulse">Conectando REHABILITAFONO...</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 w-64 bg-purple-900 text-white flex flex-col shrink-0 z-50 transition-transform duration-300 shadow-2xl`}>
        <div className="p-8 border-b border-purple-800 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black tracking-tighter">REHABILITAFONO</h1>
            <p className="text-[9px] text-purple-300 font-bold uppercase tracking-widest mt-1">Health & Sales SaaS</p>
          </div>
          <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}><X size={20}/></button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <SidebarLink icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => {setView('dashboard'); setIsSidebarOpen(false);}} />
          <SidebarLink icon={ClipboardList} label="Movimientos" active={view === 'records'} onClick={() => {setView('records'); setIsSidebarOpen(false);}} />
          <SidebarLink icon={History} label="Consolidado" active={view === 'annual'} onClick={() => {setView('annual'); setIsSidebarOpen(false);}} />
          <SidebarLink icon={Package} label="Inventario" active={view === 'inventory'} onClick={() => {setView('inventory'); setIsSidebarOpen(false);}} />
        </nav>

        <div className="p-6 border-t border-purple-800 space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-green-400 bg-green-500/10 p-2 rounded-xl">
            <Cloud size={14} /> Cloud Sincronizado
          </div>
          <button onClick={exportCSV} className="w-full bg-purple-800 hover:bg-purple-700 p-3 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 border border-purple-700 transition-colors">
            <Download size={14} /> Exportar Backup
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="bg-white p-4 lg:p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 bg-slate-100 rounded-lg" onClick={() => setIsSidebarOpen(true)}><Menu size={20}/></button>
            <h2 className="text-lg font-black text-slate-700 uppercase tracking-tighter">
              {view === 'dashboard' ? `Control de ${MESES[selectedMonth]}` : view === 'annual' ? 'Consolidado Anual' : 'Gestión'}
            </h2>
          </div>
          
          <div className="flex gap-2 lg:gap-4">
            <button 
              onClick={() => { setFormData(p => ({ ...p, tipo: 'Ingreso', categoria: CATEGORIAS_INGRESO[0] })); setShowModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 lg:px-6 py-2.5 rounded-2xl font-black text-[10px] lg:text-xs shadow-xl shadow-blue-200 transition-all active:scale-95 uppercase flex items-center gap-2"
            >
              <PlusCircle size={16} /> <span className="hidden sm:inline">Ingreso</span>
            </button>
            <button 
              onClick={() => { setFormData(p => ({ ...p, tipo: 'Egreso', categoria: CATEGORIAS_GASTO[0] })); setShowModal(true); }}
              className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 lg:px-6 py-2.5 rounded-2xl font-black text-[10px] lg:text-xs shadow-xl shadow-fuchsia-200 transition-all active:scale-95 uppercase flex items-center gap-2"
            >
              <MinusCircle size={16} /> <span className="hidden sm:inline">Gasto</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50/50">
          {view === 'dashboard' && (
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="flex justify-end">
                <select 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-white border p-2 rounded-xl text-xs font-black uppercase outline-none"
                >
                  {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 lg:gap-6">
                <KPICard label="Meta del Mes" value={META_MENSUAL_OBJETIVO} color="text-amber-500" />
                <KPICard label="Ingresos" value={stats.ing} color="text-blue-600" />
                <KPICard label="Egresos" value={stats.egr} color="text-fuchsia-600" />
                <KPICard label="Ganancia Real" value={stats.saldo} color="text-white" bg="bg-purple-900" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 lg:p-12 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col items-center min-h-[450px]">
                  <h3 className="text-slate-700 font-black mb-6 self-start flex items-center gap-2 uppercase text-xs tracking-widest">
                    <TrendingUp size={18} className="text-fuchsia-600"/> Progreso Faltante
                  </h3>
                  <div className="flex-1 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={[
                            { name: 'Logrado', value: stats.ing || 1, color: '#3b82f6' },
                            { name: 'Faltante', value: stats.faltante || 0.1, color: '#d946ef' }
                          ]} 
                          innerRadius="75%" outerRadius="100%" paddingAngle={8} dataKey="value" startAngle={90} endAngle={450} stroke="none"
                        >
                          <Cell fill="#3b82f6" />
                          <Cell fill="#d946ef" />
                        </Pie>
                        <Tooltip formatter={(v) => `$${v.toLocaleString('es-CL')}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-6xl lg:text-7xl font-black text-fuchsia-600 leading-none">{Math.round(stats.porcRestante)}%</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Por Cumplir</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
                    <h4 className="font-black text-slate-700 flex items-center gap-2 mb-4 uppercase text-xs">Stock de Libros</h4>
                    <span className={`text-6xl font-black ${stats.librosStock <= 3 ? 'text-red-600 animate-pulse' : 'text-slate-800'}`}>{stats.librosStock}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'annual' && (
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 min-h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={annualData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                    <Tooltip formatter={(v) => `$${v.toLocaleString('es-CL')}`} />
                    <Legend />
                    <Bar dataKey="ingresos" name="Ingresos" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="egresos" name="Egresos" fill="#d946ef" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {view === 'records' && (
            <div className="max-w-6xl mx-auto bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="p-6 text-[10px] font-black uppercase text-slate-400">Fecha</th>
                    <th className="p-6 text-[10px] font-black uppercase text-slate-400">Concepto</th>
                    <th className="p-6 text-[10px] font-black uppercase text-slate-400 text-right">Monto</th>
                    <th className="p-6 text-[10px] font-black uppercase text-slate-400 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="p-6 text-xs text-slate-400 font-bold">{r.fecha}</td>
                      <td className="p-6">
                        <div className="font-black text-slate-700 text-sm uppercase">{r.categoria}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{r.nombre}</div>
                      </td>
                      <td className={`p-6 text-right font-black ${r.tipo === 'Ingreso' ? 'text-blue-600' : 'text-fuchsia-600'}`}>
                        ${Number(r.monto).toLocaleString('es-CL')}
                      </td>
                      <td className="p-6 text-center">
                        <button onClick={() => handleDelete(r.id)} className="text-slate-200 hover:text-red-500"><Trash2 size={18}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'inventory' && (
            <div className="max-w-6xl mx-auto p-12 bg-white rounded-[4rem] border border-slate-100 shadow-sm text-center">
              <h3 className="text-4xl font-black text-slate-800 uppercase leading-none mb-6">Stock de Libros</h3>
              <div className="flex items-baseline justify-center gap-4">
                <span className={`text-9xl font-black ${stats.librosStock <= 3 ? 'text-red-600' : 'text-slate-900'}`}>{stats.librosStock}</span>
                <span className="text-xl font-black text-slate-300 uppercase">/ {STOCK_INICIAL_LIBROS}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE REGISTRO */}
      {showModal && (
        <div className="fixed inset-0 bg-purple-950/90 backdrop-blur-xl z-[100] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
            <div className={`p-8 text-white flex justify-between items-center ${formData.tipo === 'Ingreso' ? 'bg-blue-600' : 'bg-fuchsia-600'}`}>
              <h3 className="text-2xl font-black uppercase tracking-tighter">Nuevo {formData.tipo}</h3>
              <button onClick={() => setShowModal(false)} className="bg-white/20 p-2 rounded-full">✕</button>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</label>
                  <select className="w-full bg-slate-50 border-4 border-slate-100 rounded-2xl p-4 font-bold" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value})}>
                    {(formData.tipo === 'Ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto ($ CLP)</label>
                  <input type="number" required className="w-full bg-slate-50 border-4 border-slate-100 rounded-2xl p-4 font-black" value={formData.monto} onChange={(e) => setFormData({...formData, monto: e.target.value})} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Paciente / Detalle</label>
                <input type="text" required className="w-full bg-slate-50 border-4 border-slate-100 rounded-2xl p-4 font-bold" value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contacto</label>
                  <input type="text" className="w-full bg-slate-50 border-4 border-slate-100 rounded-2xl p-4" value={formData.contacto} onChange={(e) => setFormData({...formData, contacto: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad</label>
                  <input type="number" min="1" className="w-full bg-slate-50 border-4 border-slate-100 rounded-2xl p-4 font-black" value={formData.cantidad} onChange={(e) => setFormData({...formData, cantidad: e.target.value})} />
                </div>
              </div>

              <button type="submit" className={`w-full py-5 rounded-[2.5rem] text-white font-black uppercase tracking-tighter shadow-xl mt-4 ${formData.tipo === 'Ingreso' ? 'bg-blue-600' : 'bg-fuchsia-600'}`}>
                Guardar en Nube
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SidebarLink = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${active ? 'bg-amber-400 text-purple-900 font-black' : 'hover:bg-purple-800 text-purple-200'}`}>
    <Icon size={18} /> <span className="text-[10px] uppercase tracking-widest">{label}</span>
  </button>
);

const KPICard = ({ label, value, color, bg = "bg-white" }) => (
  <div className={`${bg} p-6 rounded-[2.5rem] shadow-sm border border-slate-100`}>
    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-2xl font-black ${color}`}>${value.toLocaleString('es-CL')}</p>
  </div>
);

export default App;
