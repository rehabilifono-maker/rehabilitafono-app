import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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
  TrendingUp, Download, Menu, X, Trash2, Loader2, Cloud
} from 'lucide-react';

// --- CONFIGURACIÓN PARA PRODUCCIÓN ---
const firebaseConfig = {
  apiKey: "AIzaSy...", 
  authDomain: "rehabilitafono.firebaseapp.com",
  projectId: "rehabilitafono",
  storageBucket: "rehabilitafono.appspot.com",
  messagingSenderId: "123",
  appId: "123"
};

// Inicialización segura
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) { console.error(e); }

const appId = 'rehabilitafono-produccion';
const META_MENSUAL_OBJETIVO = 1500000;
const STOCK_INICIAL_LIBROS = 10;
const CATEGORIAS_INGRESO = ["Evaluación", "Terapia", "Oídos", "Operativo", "Libros", "Otros"];
const CATEGORIAS_GASTO = ["Combustible", "Tag", "Transporte", "Alimentación", "Materiales", "Otros"];
const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [formData, setFormData] = useState({
    tipo: 'Ingreso',
    categoria: CATEGORIAS_INGRESO[0],
    monto: '',
    cantidad: 1,
    nombre: '',
    metodoPago: METODOS_PAGO[0],
    fecha: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) signInAnonymously(auth);
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) { setLoading(false); return; }
    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'registros');
    const unsubscribe = onSnapshot(recordsRef, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [user]);

  const stats = useMemo(() => {
    const currentRecords = records.filter(r => {
      const d = new Date(r.fecha);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
    const ing = currentRecords.filter(r => r.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto || 0), 0);
    const egr = currentRecords.filter(r => r.tipo === 'Egreso').reduce((a, b) => a + Number(b.monto || 0), 0);
    const vendidos = records.filter(r => r.categoria === 'Libros').reduce((a, b) => a + Number(b.cantidad || 0), 0);
    return { ing, egr, saldo: ing - egr, faltante: Math.max(0, META_MENSUAL_OBJETIVO - ing), stock: STOCK_INICIAL_LIBROS - vendidos };
  }, [records, selectedMonth, selectedYear]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!db || !user) return;
    try {
      const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'registros');
      await addDoc(recordsRef, { ...formData, userId: user.uid, ts: Date.now() });
      setShowModal(false);
      setFormData(prev => ({ ...prev, monto: '', nombre: '' }));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registros', id));
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-purple-900 text-white">
      <Loader2 className="animate-spin mb-4" size={40} />
      <p className="font-black text-xs uppercase tracking-widest">Iniciando Rehabilitafono...</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* Sidebar Móvil */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-purple-950 text-white z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300`}>
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h1 className="font-black text-xl tracking-tighter">REHABILITAFONO</h1>
          <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}><X/></button>
        </div>
        <nav className="p-4 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full text-left p-4 rounded-2xl text-xs font-bold uppercase flex items-center gap-3 ${view === 'dashboard' ? 'bg-amber-400 text-purple-900' : 'hover:bg-white/5'}`}>
            <LayoutDashboard size={18}/> Dashboard
          </button>
          <button onClick={() => setView('records')} className={`w-full text-left p-4 rounded-2xl text-xs font-bold uppercase flex items-center gap-3 ${view === 'records' ? 'bg-amber-400 text-purple-900' : 'hover:bg-white/5'}`}>
            <ClipboardList size={18}/> Movimientos
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="p-4 lg:p-6 bg-white border-b flex justify-between items-center shadow-sm">
          <button className="lg:hidden p-2" onClick={() => setIsSidebarOpen(true)}><Menu/></button>
          <h2 className="font-black uppercase text-xs tracking-widest text-slate-400">{view}</h2>
          <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-lg shadow-blue-200 active:scale-95 transition-all">
            + Nuevo Registro
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {view === 'dashboard' && (
            <div className="max-w-5xl mx-auto space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card label="Ingresos" value={stats.ing} color="text-blue-600" />
                <Card label="Gastos" value={stats.egr} color="text-fuchsia-600" />
                <Card label="Saldo" value={stats.saldo} color="text-purple-900" />
                <Card label="Libros" value={stats.stock} color="text-amber-600" isStock />
              </div>

              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col items-center">
                <h3 className="font-black uppercase text-[10px] tracking-[0.2em] mb-10 text-slate-400">Progreso Meta Mensual $1.5M</h3>
                <div className="h-72 w-full max-w-sm relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={[{v: stats.ing || 1}, {v: stats.faltante || 0}]} 
                        innerRadius="80%" outerRadius="100%" paddingAngle={5} 
                        dataKey="v" startAngle={90} endAngle={450} stroke="none"
                      >
                        <Cell fill="#2563eb" /><Cell fill="#f1f5f9" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-5xl font-black text-blue-600 tracking-tighter">
                      {Math.round((stats.ing/META_MENSUAL_OBJETIVO)*100)}%
                    </p>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Logrado</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'records' && (
            <div className="max-w-5xl mx-auto bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="p-6 text-[10px] font-black uppercase text-slate-400">Fecha</th>
                      <th className="p-6 text-[10px] font-black uppercase text-slate-400">Concepto</th>
                      <th className="p-6 text-[10px] font-black uppercase text-slate-400 text-right">Monto</th>
                      <th className="p-6 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.sort((a,b) => b.ts - a.ts).map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-6 text-xs text-slate-400 font-bold">{r.fecha}</td>
                        <td className="p-6">
                          <p className="font-black text-sm uppercase text-slate-700">{r.nombre || 'S/N'}</p>
                          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{r.categoria}</p>
                        </td>
                        <td className={`p-6 text-right font-black ${r.tipo === 'Ingreso' ? 'text-blue-600' : 'text-fuchsia-600'}`}>
                          ${Number(r.monto).toLocaleString('es-CL')}
                        </td>
                        <td className="p-6 text-center">
                          <button onClick={() => handleDelete(r.id)} className="text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-purple-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
             <div className={`p-8 text-white flex justify-between items-center ${formData.tipo === 'Ingreso' ? 'bg-blue-600' : 'bg-fuchsia-600'}`}>
               <h3 className="font-black uppercase tracking-tighter">Nuevo {formData.tipo}</h3>
               <button onClick={() => setShowModal(false)} className="bg-white/20 p-2 rounded-full hover:bg-white/40">✕</button>
             </div>
             <form onSubmit={handleSave} className="p-8 space-y-4">
               <div className="flex p-1 bg-slate-100 rounded-2xl">
                 <button type="button" onClick={() => setFormData({...formData, tipo: 'Ingreso', categoria: CATEGORIAS_INGRESO[0]})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${formData.tipo === 'Ingreso' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Ingreso</button>
                 <button type="button" onClick={() => setFormData({...formData, tipo: 'Egreso', categoria: CATEGORIAS_GASTO[0]})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${formData.tipo === 'Egreso' ? 'bg-white shadow-sm text-fuchsia-600' : 'text-slate-400'}`}>Gasto</button>
               </div>
               
               <select className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-purple-200 outline-none rounded-2xl font-bold text-sm" value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})}>
                 {(formData.tipo === 'Ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO).map(c => <option key={c} value={c}>{c}</option>)}
               </select>

               <input type="text" placeholder="Detalle (Nombre Paciente)" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} required />
               
               <div className="relative">
                 <span className="absolute left-4 top-4 font-black text-slate-300">$</span>
                 <input type="number" placeholder="Monto" className="w-full p-4 pl-8 bg-slate-50 rounded-2xl font-black outline-none" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} required />
               </div>

               <button type="submit" className={`w-full py-5 rounded-2xl text-white font-black uppercase tracking-widest shadow-xl mt-4 ${formData.tipo === 'Ingreso' ? 'bg-blue-600 shadow-blue-100' : 'bg-fuchsia-600 shadow-fuchsia-100'}`}>
                 Guardar Registro
               </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Card = ({ label, value, color, isStock = false }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-2xl font-black ${color}`}>
      {isStock ? value : `$${Number(value).toLocaleString('es-CL')}`}
    </p>
  </div>
);

export default App;
