"use client";

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const DnaAnimation = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = 600;
        const height = canvas.height = 600;

        let animationFrameId;
        let rotation = 0;

        const drawDNA = () => {
            ctx.clearRect(0, 0, width, height);

            const centerX = width / 2;
            const centerY = height / 2;
            const amplitude = 80;
            const frequency = 0.05;
            const helixHeight = 400;
            const segments = 60;

            rotation += 0.01;

            // Draw DNA helix strands
            for (let i = 0; i < segments; i++) {
                const y = (i / segments) * helixHeight - helixHeight / 2;
                const angle = i * frequency * 2 * Math.PI + rotation;

                // Left strand
                const x1 = centerX + Math.cos(angle) * amplitude;
                const y1 = centerY + y;

                // Right strand
                const x2 = centerX + Math.cos(angle + Math.PI) * amplitude;
                const y2 = centerY + y;

                // Draw base pairs (connecting lines)
                if (i % 3 === 0) {
                    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
                    gradient.addColorStop(0, '#3b82f6');
                    gradient.addColorStop(1, '#14b8a6');

                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }

                // Draw strand points
                const drawPoint = (x, y, hue) => {
                    const pointGradient = ctx.createRadialGradient(x, y, 0, x, y, 6);
                    pointGradient.addColorStop(0, hue === 1 ? '#3b82f6' : '#14b8a6');
                    pointGradient.addColorStop(1, hue === 1 ? '#1d4ed8' : '#0d9488');

                    ctx.fillStyle = pointGradient;
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.arc(x, y, 6, 0, Math.PI * 2);
                    ctx.fill();

                    // Glow effect
                    ctx.globalAlpha = 0.2;
                    ctx.beginPath();
                    ctx.arc(x, y, 10, 0, Math.PI * 2);
                    ctx.fill();
                };

                drawPoint(x1, y1, 1);
                drawPoint(x2, y2, 2);
            }

            animationFrameId = requestAnimationFrame(drawDNA);
        };

        drawDNA();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="relative"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-teal-400/20 rounded-full blur-3xl"></div>
                <canvas
                    ref={canvasRef}
                    width={600}
                    height={600}
                    className="relative z-10 max-w-full h-auto"
                />
            </motion.div>
        </div>
    );
};

export default DnaAnimation;
