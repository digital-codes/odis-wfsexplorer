"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/language-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { X, Square, Trash2, Plus } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamically import the map component with no SSR
const BboxMap = dynamic(() => import("@/components/bbox-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full flex items-center justify-center bg-gray-100 rounded-md border">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mb-2"></div>
        <p>Loading map...</p>
      </div>
    </div>
  )
});

export interface BBox {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

interface BboxFilterProps {
  bbox: BBox | null;
  onBboxChange: (bbox: BBox | null) => void;
  layerBounds?: {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
  };
}

export function BboxFilter({
  bbox,
  onBboxChange,
  layerBounds
}: BboxFilterProps) {
  const { t } = useLanguage();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tempBbox, setTempBbox] = useState<BBox | null>(null);

  const handleOpenDialog = () => {
    setTempBbox(bbox);
    setIsDialogOpen(true);
  };

  const handleApply = () => {
    onBboxChange(tempBbox);
    setIsDialogOpen(false);
  };

  const handleCancel = () => {
    setTempBbox(null);
    setIsDialogOpen(false);
  };

  const handleClearBbox = () => {
    setTempBbox(null);
  };

  const handleRemoveBbox = () => {
    onBboxChange(null);
  };

  const handleMapBboxChange = (newBbox: BBox | null) => {
    setTempBbox(newBbox);
  };

  const formatCoordinate = (num: number) => num.toFixed(4);

  return (
    <div className="space-y-4">
      {/* Active bbox filter display - similar to activeFilters in attribute-filter */}
      {bbox && (
        <div className="bg-muted p-3 rounded-md">
          <div className="text-sm font-medium mb-2">{t("activeFilters")}</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              {t("boundingBox")}: {t("SW")}: [{formatCoordinate(bbox.minx)},{" "}
              {formatCoordinate(bbox.miny)}] - {t("NE")}: [
              {formatCoordinate(bbox.maxx)}, {formatCoordinate(bbox.maxy)}]
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleRemoveBbox}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {t("clear")}
            </Button>
          </div>
        </div>
      )}

      {/* Bbox condition display - similar to filter conditions in attribute-filter */}
      {/* {bbox && (
        <div className="grid gap-3 p-3 border rounded-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("bboxFilter")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleRemoveBbox}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">SW Corner:</span>
              <div className="font-mono text-xs">
                [{formatCoordinate(bbox.minx)}, {formatCoordinate(bbox.miny)}]
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">NE Corner:</span>
              <div className="font-mono text-xs">
                [{formatCoordinate(bbox.maxx)}, {formatCoordinate(bbox.maxy)}]
              </div>
            </div>
          </div>
        </div>
      )} */}

      {/* Add bbox filter button - similar to addFilter button in attribute-filter */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenDialog}
          className="bg-odis-light hover:bg-active hover:!text-odis-dark text-white"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("bboxFilter")}
        </Button>

        {bbox && (
          <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={handleRemoveBbox}>
              {t("clear")}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="bg-odis-light hover:bg-active hover:!text-odis-dark text-white"
              onClick={handleOpenDialog}
            >
              {t("edit")}
            </Button>
          </div>
        )}
      </div>

      {/* Dialog for map-based bbox selection */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-5 w-5" />
              {t("selectBbox")}
            </DialogTitle>
            <DialogDescription>{t("selectBboxDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Map container - only rendered when dialog is open */}
            {isDialogOpen && (
              <div className="h-[400px] w-full">
                <BboxMap
                  initialBbox={tempBbox}
                  layerBounds={layerBounds}
                  onBboxChange={handleMapBboxChange}
                />
              </div>
            )}

            {/* Instructions */}
            <div className="text-sm text-muted-foreground">
              {t("bboxDrawInstructions")}
            </div>

            {/* Show selected bbox coordinates */}
            {tempBbox && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div className="text-sm">
                  <span className="font-medium">{t("selectedBbox")}:</span>
                  <br />
                  <span className="text-xs text-muted-foreground font-mono">
                    SW: [{formatCoordinate(tempBbox.minx)},{" "}
                    {formatCoordinate(tempBbox.miny)}] — {t("NE")}: [
                    {formatCoordinate(tempBbox.maxx)},{" "}
                    {formatCoordinate(tempBbox.maxy)}]
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearBbox}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-1" />
                  {t("clear")}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleApply}
              disabled={!tempBbox}
              className="bg-odis-light hover:bg-active hover:!text-odis-dark text-white"
            >
              {t("applyBbox")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
