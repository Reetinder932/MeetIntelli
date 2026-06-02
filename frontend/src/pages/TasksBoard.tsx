import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { taskApi, chatApi, teamApi } from '../services/api';
import CustomSelect from '../components/CustomSelect';
import { Task, User, Team } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  KanbanSquare, Check, X, UserCheck, 
  Sparkles, ArrowRight, Loader2, Plus,
  Trash2, Users
} from 'lucide-react';
import { motion } from 'framer-motion';

const TasksBoard: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create task state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | 'ALL'>('ALL');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  // Inline task input per member
  const [inlineTaskTitles, setInlineTaskTitles] = useState<Record<number, string>>({});

  const fetchTasks = async () => {
    try {
      const [taskRes, userRes, teamRes] = await Promise.all([
        taskApi.list(),
        chatApi.users(),
        teamApi.list(),
      ]);
      setTasks(taskRes.data);
      setUsers(userRes.data);
      setTeams(teamRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async (teamId: number) => {
    try {
      await teamApi.join(teamId);
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveTeam = async (teamId: number) => {
    try {
      await teamApi.leave(teamId);
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      await teamApi.create(newTeamName.trim(), newTeamDesc.trim());
      fetchTasks();
      setShowCreateTeamModal(false);
      setNewTeamName('');
      setNewTeamDesc('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateInlineTask = async (memberId: number, e: React.FormEvent) => {
    e.preventDefault();
    const title = inlineTaskTitles[memberId]?.trim();
    if (!title) return;
    try {
      const res = await taskApi.create({
        title,
        status: 'TODO',
        assignedUser: { id: memberId }
      });
      
      const assignedMember = users.find(u => u.id === memberId);
      const newTask = {
        ...res.data,
        assignedUser: res.data.assignedUser || (assignedMember ? { id: assignedMember.id, name: assignedMember.name, email: assignedMember.email } : { id: memberId })
      };
      
      // Update state immediately
      setTasks(prevTasks => [...prevTasks, newTask]);
      setInlineTaskTitles(prev => ({ ...prev, [memberId]: '' }));
      
      // Sync list with a delay to let database settle
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const payload: any = {
        title: newTitle.trim(),
        description: newDesc.trim(),
        status: 'TODO',
      };
      if (user) {
        payload.assignedUser = { id: user.id }; // Automatically assign to the logged-in user
      }
      
      const res = await taskApi.create(payload);
      
      // Update state immediately
      const newTask = {
        ...res.data,
        assignedUser: res.data.assignedUser || (user ? { id: user.id, name: user.name, email: user.email } : undefined)
      };
      setTasks(prevTasks => [...prevTasks, newTask]);
      
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      
      // Sync list with a delay to let database settle
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
    }
  };

  const updateStatus = async (id: number, status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED') => {
    // Optimistic update
    setTasks(prevTasks => prevTasks.map(t => t.id === id ? { ...t, status } : t));
    try {
      await taskApi.updateStatus(id, status);
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const assignUser = async (taskId: number, userId: number) => {
    const targetUser = users.find(u => u.id === userId);
    setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? { ...t, assignedUser: targetUser } : t));
    try {
      await taskApi.assign(taskId, userId);
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    // Optimistic delete
    setTasks(prevTasks => prevTasks.filter(t => t.id !== id));
    try {
      await taskApi.deleteTask(id);
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const handleAcceptSuggestion = async (id: number) => {
    // Optimistic status update
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === id && t.suggestedUpdate) {
        const parts = t.suggestedUpdate.split('->');
        if (parts.length === 2) {
          const statusStr = parts[1].trim().toUpperCase().replace(' ', '_');
          let newStatus = t.status;
          if (statusStr.includes("COMPLET")) newStatus = 'COMPLETED';
          else if (statusStr.includes("PROGRESS")) newStatus = 'IN_PROGRESS';
          else newStatus = 'TODO';
          return { ...t, status: newStatus as any, suggestedUpdate: undefined };
        }
      }
      return t;
    }));
    try {
      await taskApi.acceptSuggestion(id);
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const handleRejectSuggestion = async (id: number) => {
    setTasks(prevTasks => prevTasks.map(t => t.id === id ? { ...t, suggestedUpdate: undefined } : t));
    try {
      await taskApi.rejectSuggestion(id);
      setTimeout(() => {
        fetchTasks();
      }, 800);
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  // Filter displaying users sections
  const displayUsers = selectedTeamId === 'ALL'
    ? (user ? [user] : [])
    : (teams.find(t => t.id === selectedTeamId)?.members || []);

  const unassignedTasks = tasks.filter(t => !t.assignedUser);

  return (
    <Layout title="Tasks Board">
      <div className="space-y-6 select-none">
        
        {/* Board Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">Collaboration Board</h2>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">Jira-style workflow board showing your personal tasks or active team tasks with AI recommendations.</p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/95 text-primary-foreground py-3 px-5 rounded-xl font-bold shadow-lg shadow-primary/20 text-sm transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" /> Create Task
          </button>
        </div>

        {/* Teams Management Bar */}
        <div className="relative z-20 bg-card/65 backdrop-blur-md border border-border/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex flex-col">
              <label htmlFor="team-filter" className="text-xs uppercase font-extrabold text-muted-foreground tracking-wider mb-2">
                Active Team Board
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <CustomSelect
                  value={selectedTeamId}
                  onChange={(val) => setSelectedTeamId(val === 'ALL' ? 'ALL' : Number(val))}
                  options={[
                    { value: 'ALL', label: 'My Tasks Board' },
                    ...teams.map((t) => ({ value: t.id, label: t.name }))
                  ]}
                  triggerClassName="text-base text-foreground font-bold min-w-[220px]"
                />
              </div>
            </div>

            {selectedTeamId !== 'ALL' && (
              <div className="flex flex-col">
                <span className="text-xs uppercase font-extrabold text-muted-foreground tracking-wider mb-2">
                  Team Members ({teams.find(tm => tm.id === selectedTeamId)?.members.length || 0})
                </span>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {teams
                    .find((tm) => tm.id === selectedTeamId)
                    ?.members.map((m) => (
                      <span 
                        key={m.id} 
                        className="text-sm bg-muted border border-border/60 text-foreground font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm"
                        title={m.email}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {m.name}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedTeamId !== 'ALL' && (() => {
              const currentTeam = teams.find(tm => tm.id === selectedTeamId);
              const isMember = currentTeam?.members.some(m => m.id === user?.id);
              return (
                <button
                  onClick={() => isMember ? handleLeaveTeam(Number(selectedTeamId)) : handleJoinTeam(Number(selectedTeamId))}
                  className={`px-5 py-2.5 text-sm font-extrabold rounded-xl transition-all cursor-pointer border ${
                    isMember 
                      ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20' 
                      : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'
                  }`}
                >
                  {isMember ? 'Leave Team' : 'Join Team'}
                </button>
              );
            })()}
            
            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-xl border border-border transition-colors cursor-pointer"
            >
              + Create Team
            </button>
          </div>
        </div>

        {/* Board Tasks Sections */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {displayUsers.map((member) => {
              const memberTasks = tasks.filter(t => t.assignedUser?.id === member.id);
              const todoTasks = memberTasks.filter(t => t.status === 'TODO');
              const inProgressTasks = memberTasks.filter(t => t.status === 'IN_PROGRESS');
              const completedTasks = memberTasks.filter(t => t.status === 'COMPLETED');
              const totalCount = memberTasks.length;
              const completionRate = totalCount > 0 ? Math.round((completedTasks.length / totalCount) * 100) : 0;
              const initials = member.name ? member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

              return (
                <div key={member.id} className="bg-card/45 border border-border/80 rounded-2xl p-6 space-y-5 shadow-md backdrop-blur-md">
                  {/* User Section Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-extrabold flex items-center justify-center text-lg shadow-md shadow-indigo-600/10">
                        {initials}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-foreground tracking-tight">
                          {member.name}
                          {member.id === user?.id && (
                            <span className="text-xs text-primary font-extrabold bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full ml-3">
                              You
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-muted-foreground font-semibold">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 text-sm font-bold text-muted-foreground">
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> To Do: {todoTasks.length}</span>
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Active: {inProgressTasks.length}</span>
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Done: {completedTasks.length}</span>
                      {memberTasks.length > 0 && (
                        <span className="px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm">
                          {completionRate}% Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tasks under this User */}
                  {memberTasks.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground/60 font-bold">
                      No tasks assigned to {member.name} yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {memberTasks.map((task) => (
                        <div key={task.id} className="p-5 bg-muted/40 border border-border/60 rounded-xl space-y-4 hover:border-primary/25 relative transition-all shadow duration-300 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="font-extrabold text-base text-foreground leading-normal">{task.title}</h4>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-muted-foreground hover:text-red-400 cursor-pointer p-0.5 transition-colors"
                                title="Delete Task"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            </div>
                            {task.description && (
                              <p className="text-sm text-muted-foreground mt-2 leading-relaxed font-normal">{task.description}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/20 mt-4">
                            <CustomSelect
                              value={task.status}
                              onChange={(val) => updateStatus(task.id, val as any)}
                              options={[
                                { value: 'TODO', label: 'To Do' },
                                { value: 'IN_PROGRESS', label: 'In Progress' },
                                { value: 'COMPLETED', label: 'Completed' },
                              ]}
                              triggerClassName={`text-xs font-bold px-2.5 py-1.5 border rounded-lg ${
                                task.status === 'COMPLETED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40'
                                  : task.status === 'IN_PROGRESS'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:border-amber-500/40'
                                  : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40'
                              }`}
                            />
                          </div>

                          {/* AI Recommendation widget */}
                          {task.suggestedUpdate && (
                            <div className="p-3 bg-primary/5 border border-primary/15 rounded-lg space-y-2 relative overflow-hidden mt-3">
                              <span className="text-[10px] uppercase font-bold text-primary flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" /> AI Recommendation
                              </span>
                              <p className="text-sm text-foreground/90 font-medium">
                                Update to: <span className="font-semibold text-primary">{task.suggestedUpdate.split('->')[1]}</span>
                              </p>
                              <div className="flex justify-end gap-2 text-xs font-bold">
                                <button
                                  onClick={() => handleRejectSuggestion(task.id)}
                                  className="px-2.5 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-destructive cursor-pointer hover:bg-card transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleAcceptSuggestion(task.id)}
                                  className="px-2.5 py-1.5 bg-primary hover:bg-primary/95 text-primary-foreground rounded-lg cursor-pointer transition-all flex items-center gap-0.5"
                                >
                                  <Check className="w-4 h-4" /> Accept
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline Task Creator under this member */}
                  <form onSubmit={(e) => handleCreateInlineTask(member.id, e)} className="flex gap-3 pt-4 border-t border-border/40">
                    <input
                      type="text"
                      required
                      placeholder={`Add task for ${member.name}...`}
                      value={inlineTaskTitles[member.id] || ''}
                      onChange={(e) => setInlineTaskTitles(prev => ({ ...prev, [member.id]: e.target.value }))}
                      className="max-w-md bg-muted/30 border border-border/55 focus:border-primary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none transition-all font-medium"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl transition-all cursor-pointer flex items-center justify-center font-bold text-sm"
                      title="Create Task"
                    >
                      <Plus className="w-4.5 h-4.5 mr-1.5" /> Add Task
                    </button>
                  </form>
                </div>
              );
            })}

            {/* Unassigned Tasks Section */}
            {unassignedTasks.length > 0 && (
              <div className="bg-card/45 border border-border/80 rounded-2xl p-6 space-y-4 shadow-md backdrop-blur-md">
                <div className="pb-4 border-b border-border/40">
                  <h3 className="text-2xl font-bold text-foreground tracking-tight">Unassigned Tasks</h3>
                  <p className="text-sm text-muted-foreground font-medium">Tasks that are not assigned to any user yet.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unassignedTasks.map((task) => (
                    <div key={task.id} className="p-5 bg-muted/40 border border-border/60 rounded-xl space-y-4 hover:border-primary/25 relative transition-all shadow duration-300 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-extrabold text-base text-foreground">{task.title}</h4>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-muted-foreground hover:text-red-400 cursor-pointer p-0.5 transition-colors"
                            title="Delete Task"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed font-normal">{task.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/20 mt-4">
                        <CustomSelect
                          value={task.status}
                          onChange={(val) => updateStatus(task.id, val as any)}
                          options={[
                            { value: 'TODO', label: 'To Do' },
                            { value: 'IN_PROGRESS', label: 'In Progress' },
                            { value: 'COMPLETED', label: 'Completed' },
                          ]}
                          triggerClassName={`text-xs font-bold px-2.5 py-1.5 border rounded-lg ${
                            task.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40'
                              : task.status === 'IN_PROGRESS'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:border-amber-500/40'
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40'
                          }`}
                        />

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground font-bold">Assign:</span>
                          <CustomSelect
                            value=""
                            onChange={(val) => assignUser(task.id, Number(val))}
                            options={
                              selectedTeamId === 'ALL'
                                ? (user ? [{ value: user.id, label: user.name }] : [])
                                : (teams.find(t => t.id === selectedTeamId)?.members.map(tm => ({
                                    value: tm.id,
                                    label: tm.name
                                  })) || [])
                            }
                            placeholder="Select User"
                            triggerClassName="text-xs bg-muted/60 border border-border/50 rounded-lg px-2 py-1 text-foreground font-bold max-w-[130px]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border p-6 rounded-3xl shadow-2xl space-y-5"
          >
            <h3 className="font-bold text-xl text-foreground">Create New Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Design WebSocket module"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</label>
                <textarea
                  placeholder="Details of the task..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 h-28 font-medium"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-all hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer"
                >
                  Create Task
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Create Team Modal */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border p-6 rounded-3xl shadow-2xl space-y-5"
          >
            <h3 className="font-bold text-xl text-foreground">Create New Team</h3>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Team Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Frontend Engineering"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</label>
                <textarea
                  placeholder="What is this team about..."
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 h-28 font-medium"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-all hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer"
                >
                  Create Team
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </Layout>
  );
};

export default TasksBoard;
