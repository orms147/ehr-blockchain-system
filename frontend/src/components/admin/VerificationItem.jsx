import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Building2, Stethoscope, Calendar } from 'lucide-react';

const VerificationItem = ({ item, onAction }) => {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={{ scale: 1.005, backgroundColor: '#F8FAFC' }}
            className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 group"
        >
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.type === 'Organization'
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-blue-100 text-blue-600'
                    }`}>
                    {item.type === 'Organization' ? <Building2 className="w-6 h-6" /> : <Stethoscope className="w-6 h-6" />}
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-900">{item.name}</h4>
                        <Badge variant="outline" className="text-xs font-normal bg-slate-50">
                            {item.type}
                        </Badge>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-slate-500 font-mono">
                        <span className="truncate max-w-[200px]">{item.address}</span>
                        <span className="hidden sm:inline text-slate-300">•</span>
                        <span className="flex items-center gap-1 text-slate-500 font-sans">
                            <Calendar className="w-3 h-3" /> {item.date}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                <motion.div whileTap={{ scale: 0.95 }}>
                    <Button
                        onClick={() => onAction(item, 'verify')}
                        className="bg-green-600 hover:bg-green-700 text-white shadow-sm h-9 px-4"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Verify
                    </Button>
                </motion.div>

                <motion.div whileTap={{ scale: 0.95 }}>
                    <Button
                        variant="outline"
                        onClick={() => onAction(item, 'reject')}
                        className="border-red-200 text-red-600 hover:bg-red-50 h-9 px-4"
                    >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                    </Button>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default VerificationItem;
