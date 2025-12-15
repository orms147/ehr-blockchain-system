import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Lock, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const EmergencyAccessForm = ({ onSubmit }) => {
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 2000));
        onSubmit();
        setLoading(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto"
        >
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-red-800 font-bold mb-1">Emergency Override Protocol</h3>
                    <p className="text-sm text-red-700">
                        This action bypasses standard privacy controls. It is recorded on the blockchain and is immutable.
                        Misuse of this feature may result in license revocation and legal action.
                    </p>
                </div>
            </div>

            <Card className="border-red-100 shadow-lg overflow-hidden">
                <CardHeader className="bg-red-500 text-white py-6">
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Lock className="w-6 h-6" />
                        Request Emergency Access
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="emergency-address">Patient Wallet Address</Label>
                            <Input
                                id="emergency-address"
                                placeholder="0x..."
                                required
                                className="font-mono border-red-100 focus:border-red-500 focus:ring-red-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="witness">Witness Address (Optional)</Label>
                            <Input
                                id="witness"
                                placeholder="0x..."
                                className="font-mono border-red-100 focus:border-red-500 focus:ring-red-500"
                            />
                            <p className="text-xs text-slate-500">Additional medical professional to verify emergency.</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="justification" className="text-red-900">Medical Justification <span className="text-red-500">*</span></Label>
                            <Textarea
                                id="justification"
                                placeholder="Detailed reason for emergency access bypass..."
                                className="min-h-[120px] border-red-100 focus:border-red-500 focus:ring-red-500 bg-red-50/30"
                                required
                            />
                        </div>

                        <div className="pt-4">
                            <Button
                                type="submit"
                                variant="destructive"
                                className="w-full bg-red-600 hover:bg-red-700 text-white h-12 text-lg shadow-md hover:shadow-xl transition-all"
                                disabled={loading}
                            >
                                {loading ? 'Verifying Emergency Protocol...' : (
                                    <span className="flex items-center gap-2">
                                        <Eye className="w-5 h-5" />
                                        Override Access Controls
                                    </span>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default EmergencyAccessForm;
